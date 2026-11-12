import { useEffect, useRef, useState } from 'react';
import { Check, Circle, Minus, Plus, RotateCcw, RotateCw, House, View } from 'lucide-react';
import { Icon, Button } from './ui';
import './classroom.css';

export default function Classroom({ students, attendance, disabled, readOnly = false, onPresent, onAbsent, className, date }) {
  const host = useRef(null), scene = useRef(null), nameTag = useRef(null);
  const [selected, setSelected] = useState(null), [state, setState] = useState('loading'), [view, setView] = useState('perspective');
  const rosterKey = JSON.stringify(students.map(s => s.id));
  const latest = useRef({ attendance, selected, view }); latest.current = { attendance, selected, view };
  useEffect(() => {
    let cancelled = false, room;
    import('./classroom-scene').then(({ createClassroom }) => {
      if (cancelled) return;
      try {
        room = createClassroom(host.current, {
          students: JSON.parse(rosterKey).map(id => ({ id })), title: className, onSelect: setSelected, onFailure: () => setState('error'),
          onProject: ({ x, y, visible }) => {
            if (!nameTag.current) return;
            nameTag.current.hidden = !visible;
            if (visible) { nameTag.current.style.left = `${Math.max(85, Math.min(host.current.clientWidth - 85, x))}px`; nameTag.current.style.top = `${Math.max(140, y)}px`; }
          }
        });
        scene.current = room; room.setView(latest.current.view); room.updateAttendance(latest.current.attendance); room.select(latest.current.selected); setState('ready');
      } catch { setState('error'); }
    }).catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; room?.dispose(); scene.current = null; };
  }, [rosterKey, className]);
  useEffect(() => { scene.current?.updateAttendance(attendance); }, [attendance]);
  useEffect(() => { scene.current?.select(selected); }, [selected]);
  const student = students.find(s => s.id === selected);
  const label = status => status === 'present' ? 'Có mặt' : status === 'absent' ? 'Vắng' : 'Chưa điểm danh';
  const switchView = next => { setView(next); scene.current?.setView(next); };
  return <div className="classroom" aria-label={`Mô phỏng phòng học ${className}`}>
    <div className="classroom-guide"><p>Kéo để xoay phòng · Cuộn hoặc dùng hai ngón để thu phóng · Chạm bàn để chọn học sinh</p><span>Mô hình minh họa, chỗ ngồi theo danh sách lớp.</span></div>
    <div className="room-model">
      <header className="room-model-header"><div><strong>{className}</strong><span>Buổi học · {date}</span></div><div className="room-camera-views"><button type="button" aria-pressed={view==='perspective'} disabled={state!=='ready'} onClick={()=>switchView('perspective')}><Icon icon={View} size={16}/>Nhìn chéo</button><button type="button" aria-pressed={view==='top'} disabled={state!=='ready'} onClick={()=>switchView('top')}>Từ trên</button></div></header>
      <div className="room-viewport" ref={host}/>
      <div className="room-selected-label" ref={nameTag} hidden={!student} aria-hidden="true">{student?.name}</div>
      {state==='loading'&&<div className="room-model-message" role="status">Đang dựng phòng học 3D...</div>}
      {state==='error'&&<div className="room-model-message" role="alert"><strong>Không mở được mô hình 3D.</strong><p>Bạn vẫn có thể chọn tên học sinh bên dưới để điểm danh, hoặc dùng chế độ Danh sách.</p></div>}
      <div className="room-camera-tools" aria-label="Điều khiển góc nhìn">
        <button type="button" disabled={state!=='ready'} aria-label="Xoay phòng sang trái" onClick={()=>scene.current?.rotate(-1)}><Icon icon={RotateCcw}/></button>
        <button type="button" disabled={state!=='ready'} aria-label="Xoay phòng sang phải" onClick={()=>scene.current?.rotate(1)}><Icon icon={RotateCw}/></button>
        <button type="button" disabled={state!=='ready'} aria-label="Phóng to phòng học" onClick={()=>scene.current?.zoom(1.2)}><Icon icon={Plus}/></button>
        <button type="button" disabled={state!=='ready'} aria-label="Thu nhỏ phòng học" onClick={()=>scene.current?.zoom(1/1.2)}><Icon icon={Minus}/></button>
        <button type="button" disabled={state!=='ready'} aria-label="Về góc nhìn ban đầu" onClick={()=>switchView('perspective')}><Icon icon={House}/></button>
      </div>
    </div>
    <div className="room-student-selection" aria-live="polite">
      {student?<><div><span>Chỗ {String(students.indexOf(student)+1).padStart(2,'0')}</span><strong>{student.name}</strong><small>{disabled?'Đang tải hoặc lưu điểm danh...':label(attendance[student.id])}</small></div><div className="room-attendance-actions"><Button disabled={disabled || readOnly} aria-pressed={attendance[student.id]==='present'} icon={Check} onClick={()=>onPresent(student.id)}>Có mặt</Button><Button variant="secondary" disabled={disabled || readOnly} aria-pressed={attendance[student.id]==='absent'} onClick={()=>onAbsent(student.id)}>Vắng</Button></div></>:<p>Chọn một bàn trong phòng hoặc chọn tên bên dưới để điểm danh.</p>}
    </div>
    <div className="room-roster" aria-label="Chọn học sinh theo số chỗ">{students.map((s,i)=><button type="button" key={s.id} aria-pressed={selected===s.id} className={selected===s.id?'selected':''} onClick={()=>setSelected(s.id)}><span className="room-seat-index">{String(i+1).padStart(2,'0')}</span><span><strong>{s.name}</strong><small className={attendance[s.id]==='present'?'present':attendance[s.id]==='absent'?'absent':''}><Icon icon={attendance[s.id]==='present'?Check:attendance[s.id]==='absent'?Minus:Circle} size={13}/>{disabled?'Đang tải / lưu...':label(attendance[s.id])}</small></span></button>)}</div>
    <p className="classroom-note">Chọn bàn chỉ mở thông tin học sinh. Điểm danh chỉ thay đổi khi bạn bấm Có mặt hoặc Vắng, và được lưu cho buổi đang chọn.</p>
  </div>;
}
