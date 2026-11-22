import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Download, UserRoundPlus, ArrowLeft, SlidersHorizontal, UserRound, Settings2 } from 'lucide-react';
import { api, localDate, downloadCsv } from '../lib/api';
import { isCalendarDate, WEEKDAYS } from '../../shared/class-schedule';
import { ScheduleExportTemplate } from '../pages/ScheduleExportTemplate';
import { useCenter } from './center-context';
import { Icon, Button, Avatar, Badge, Empty, Feedback, PageHead, PanelHead, Find, Select, ClassTag } from './ui';
import { dateLabel, money, workStatus, invoiceStatus } from './format';
import { classSlots, classStaff, buildScheduleBlocks, buildWeekScheduleBlocks, TIME_SLOTS, SCHEDULE_DAYS, lessonHref, shiftScheduleDate, slotHasPerson } from './schedule';
import AttendanceSessions from './AttendanceSessions';
import CompactSchedule from './CompactSchedule';
import DailySchedule from './DailySchedule';
import { summarizePay } from '../../shared/payroll';
import { scheduleOnDate } from '../../shared/schedule-history';
import { ClassNotes } from './ClassNotes';
import { useViewState } from './useViewState';
import PaymentSummary from './PaymentSummary';
import PayRates from './PayRates';
import PayrollMatrix from './PayrollMatrix';

const roomLabel = value => value ? /^phòng\b/iu.test(value) ? value : `Phòng ${value}` : 'Chưa xếp phòng';
const roleLabel = role => Number(role) === 2 ? 'Trợ giảng' : 'Giáo viên';
const matches = (value, query) => String(value || '').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'));


export function Schedule() {
  const d=useCenter(); const [teacher,setTeacher]=useViewState('schedule-person',''); const [view,setView]=useViewState('schedule-view','grid'); const [exporting,setExporting]=useState('');const [error,setError]=useState('');const [exported,setExported]=useState({});
  const [period,setPeriod]=useViewState('schedule-period',d.role==='admin'?'day':'week');
  const [scheduleDate,setScheduleDate]=useViewState('schedule-date',localDate);
  const daily=period==='day';
  const [mine,setMine]=useViewState('schedule-mine',d.role==='teacher');
  const [week,setWeek]=useViewState('schedule-week',localDate);
  const [targets]=useState(()=>({parents:{current:null},teachers:{current:null}}));
  const weekStart=shiftScheduleDate(week,-((new Date(`${week}T12:00:00Z`).getUTCDay()+6)%7));
  const weekEnd=shiftScheduleDate(weekStart,6);
  const exportBlocks=buildWeekScheduleBlocks(d.classes,d.person,week);
  const blocks=daily?buildScheduleBlocks(d.classes,d.person,scheduleDate):exportBlocks;const visible=blocks.filter(b=>(!mine||slotHasPerson(b,d.user.name))&&(!teacher||slotHasPerson(b,d.person(Number(teacher)))));
  const slots=[...new Set([...TIME_SLOTS,...blocks.map(b=>b.timeKey)])].sort();
  const exportImage=async(staff=false)=>{if(exporting)return;setExporting(staff?'teachers':'parents');setError('');try{
    const target=staff?targets.teachers.current:targets.parents.current;await document.fonts.ready;await Promise.all(Array.from(target.querySelectorAll('img')).map(img=>img.decode()));
    const html2canvas=(await import('html2canvas')).default;const canvas=await html2canvas(target,{scale:2,useCORS:true,backgroundColor:null,onclone:doc=>{doc.querySelectorAll('.export-template-wrapper').forEach(w=>{w.style.opacity='1';});doc.documentElement.style.colorScheme='light';}});
    const image=canvas.toDataURL('image/png');const filename=`Lich_Hoc_${staff?'GV_':''}${dateLabel(weekStart).replaceAll('/','-')}.png`;setExported(v=>({...v,[staff?'teachers':'parents']:{image,filename}}));const link=document.createElement('a');link.href=image;link.download=filename;link.click();d.notify('Đã tạo ảnh thời khóa biểu. Bạn có thể tải lại từ ảnh bên dưới.');
  }catch{setError('Không xuất được ảnh. Hãy thử lại bằng nút xuất ảnh.');}finally{setExporting('');}};
  return <><PageHead title="Lịch dạy"><details className="workspace-disclosure export-menu"><summary>Xuất lịch</summary><div><p>Ảnh gồm lịch toàn trung tâm trong tuần đang chọn.</p><Button icon={Download} disabled={!!exporting||!exportBlocks.length} onClick={()=>exportImage()}>Cho phụ huynh</Button><Button variant="secondary" disabled={!!exporting||!exportBlocks.length} onClick={()=>exportImage(true)}>Cho giáo viên</Button></div></details></PageHead>
    <div className="schedule-controls">{!daily&&<div className="week-controls"><Button variant="secondary" onClick={()=>setWeek(shiftScheduleDate(week,-7))}>Tuần trước</Button><Button variant="ghost" onClick={()=>setWeek(localDate())}>Tuần này</Button><Button variant="secondary" onClick={()=>setWeek(shiftScheduleDate(week,7))}>Tuần sau</Button><span>{dateLabel(weekStart)} – {dateLabel(weekEnd)}</span></div>}<div className="toolbar-end">{d.role==='teacher'&&<Select label="Phạm vi lịch" value={mine?'mine':'all'} onChange={e=>{setMine(e.target.value==='mine');setTeacher('');}}><option value="mine">Lịch của tôi</option><option value="all">Toàn trung tâm</option></Select>}{!mine&&<Select label="Người dạy" value={teacher} onChange={e=>setTeacher(e.target.value)}><option value="">Tất cả giáo viên</option>{d.teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Select>}<div className="segmented" aria-label="Khoảng thời gian xem lịch"><button aria-pressed={daily} className={daily?'selected':''} onClick={()=>setPeriod('day')}>Theo ngày</button><button aria-pressed={!daily} className={!daily?'selected':''} onClick={()=>setPeriod('week')}>Cả tuần</button></div>{!daily&&<div className="segmented" aria-label="Cách xem lịch"><button className={view==='grid'?'selected':''} onClick={()=>setView('grid')}>Thời khóa biểu</button><button className={view==='list'?'selected':''} onClick={()=>setView('list')}>Danh sách</button></div>}</div></div><Feedback error={error}/>
    {!!Object.keys(exported).length&&<section className="schedule-export-results" aria-label="Ảnh lịch vừa xuất">{Object.entries(exported).map(([type,item])=><figure key={type}><img alt={type==='parents'?'Ảnh lịch cho phụ huynh':'Ảnh TKB cho giáo viên'} src={item.image}/><figcaption><strong>{type==='parents'?'Lịch cho phụ huynh':'TKB cho giáo viên'}</strong><p>{type==='parents'?'Chỉ tên lớp':'Có giáo viên và trợ giảng'}</p><a className="text-link" href={item.image} download={item.filename}>Tải ảnh PNG<Icon icon={Download} size={15}/></a></figcaption></figure>)}<Button variant="ghost" onClick={()=>setExported({})}>Ẩn ảnh đã xuất</Button></section>}
    {daily?<DailySchedule blocks={visible} date={scheduleDate} onDateChange={setScheduleDate}/>:view==='grid'?<><CompactSchedule blocks={visible}/><div className="desktop-week-grid"><p className="timetable-hint">Có thể cuộn trong bảng để xem đủ 7 ngày.</p><div className="timetable-scroll" role="region" aria-label="Thời khóa biểu theo thứ và suất" tabIndex={0}><table className="legacy-timetable"><thead><tr><th scope="col">Giờ / Ngày</th>{SCHEDULE_DAYS.map(day=><th scope="col" key={day}>{WEEKDAYS[day]}</th>)}</tr></thead><tbody>{slots.map(time=><tr key={time}><th scope="row">{time.replace('-',' - ')}</th>{SCHEDULE_DAYS.map(day=><td key={day}>{visible.filter(b=>b.dayIndex===day&&b.timeKey===time).map(b=><Link className="timetable-class" key={b.id} to={lessonHref(b.classId,b.date,b.timeKey)}><strong>{b.className}</strong><span>GV: {b.teacher}</span><small>TG: {b.ta||'Chưa phân công'}</small><small>{roomLabel(b.room)}</small></Link>)}</td>)}</tr>)}</tbody></table></div></div></>:<div className="weekly-slot-list">{SCHEDULE_DAYS.map(day=><section className="panel" key={day}><PanelHead title={WEEKDAYS[day]}/><div className="weekly-day-classes">{visible.filter(b=>b.dayIndex===day).sort((a,b)=>a.timeKey.localeCompare(b.timeKey)).map(b=><Link className="schedule-event" key={b.id} to={lessonHref(b.classId,b.date,b.timeKey)}><span className="event-time">{b.timeKey.replace('-',' - ')}</span><strong>{b.className}</strong><small>GV: {b.teacher}</small><small>TG: {b.ta||'Chưa phân công'}</small><span>{roomLabel(b.room)}</span></Link>)}{!visible.some(b=>b.dayIndex===day)&&<p className="no-event">Không có lớp</p>}</div></section>)}</div>}
    {!blocks.length&&<Empty title="Chưa có lịch lớp" action={<Button onClick={()=>d.classEditor()}>Tạo lớp học</Button>}/>}<ScheduleExportTemplate ref={targets.parents} scheduleBlocks={exportBlocks} applyDate={dateLabel(weekStart)}/><ScheduleExportTemplate ref={targets.teachers} scheduleBlocks={exportBlocks} applyDate={dateLabel(weekStart)} includeStaff/>
  </>;
}


export function ClassDetail({ id }) {
  const d=useCenter();const c=d.cls(id);const [tab,setTab]=useViewState(`class-${id}-tab`,'attendance');const [date,setDate]=useViewState(`class-${id}-date`,localDate);
  const [historic,setHistoric]=useState([]);const [historicError,setHistoricError]=useState('');const [historicReload,setHistoricReload]=useState(0);
  const [params,setParams]=useSearchParams();
  const requestedDate=params.get('date');
  const lessonDate=isCalendarDate(requestedDate)?requestedDate:date;
  const lessonSlot=params.get('slot') || '';
  const effective=scheduleOnDate(c,lessonDate);
  const classSchedule=classSlots({ ...effective, schedule_history: [] });
  const { setMonth } = d;
  const selectedSlot=classSlots(c,lessonDate).find(slot=>slot.key===lessonSlot);
  useEffect(()=>{if(isCalendarDate(requestedDate)){setTab('attendance');setMonth(requestedDate.slice(0,7));}},[requestedDate,lessonSlot,setTab,setMonth]);
  useEffect(()=>{const controller=new AbortController();setHistoricError('');api(`/api/classes/${id}/sessions`,{signal:controller.signal}).then(rows=>{if(!controller.signal.aborted)setHistoric(rows);}).catch(e=>{if(!controller.signal.aborted)setHistoricError(e.message);});return()=>controller.abort();},[id,historicReload]);
  const changeDate=value=>{
    if(params.has('date'))setParams({}, {replace:true});
    setDate(value);
    if(value)d.setMonth(value.slice(0,7));
  };
  if(!c)return <Empty title="Không tìm thấy lớp" action={<Link className="button" to="/classes">Về danh sách lớp</Link>}/>;
  const students=d.roster(id);
  return <><Link className="back-link" to="/classes"><Icon icon={ArrowLeft} size={16}/>Danh sách lớp học</Link><PageHead title={c.name} description={`${dateLabel(lessonDate)} · ${selectedSlot ? `${selectedSlot.start}–${selectedSlot.end} · ` : ''}${roomLabel(effective.room)}`}><Link className="button secondary" to={`/tools?class=${id}`}>Công cụ trên lớp</Link>{(d.user.id||d.role==='admin')&&<Button icon={Plus} onClick={()=>d.addWork(id,lessonDate,undefined,selectedSlot?.key)}>{d.role==='admin'?'Ghi công cho giáo viên':'Ghi công'}</Button>}</PageHead>
    <div className="page-tabs"><button aria-pressed={tab==='attendance'} className={tab==='attendance'?'active':''} onClick={()=>setTab('attendance')}>Điểm danh</button><button aria-pressed={tab==='work'} className={tab==='work'?'active':''} onClick={()=>setTab('work')}>Công giảng dạy</button><button aria-pressed={tab==='notes'} className={tab==='notes'?'active':''} onClick={()=>setTab('notes')}>Ghi chú</button><button aria-pressed={tab==='info'} className={tab==='info'?'active':''} onClick={()=>setTab('info')}>Thông tin lớp</button></div>
    <div hidden={tab==='notes'||tab==='info'}>
    {tab==='attendance'?<AttendanceSessions key={id} cls={c} date={lessonDate} requestedSlot={selectedSlot?.key} onDateChange={changeDate}/>:tab==='work'?<><section className="panel"><PanelHead title={`Công của lớp · ${d.month}`} caption="Mỗi người tự ghi công bằng tài khoản cá nhân."><label className="inline-date">Tháng<input aria-label="Tháng công của lớp" type="month" value={d.month} onChange={e=>e.target.value&&d.setMonth(e.target.value)}/></label></PanelHead><Feedback error={d.workError} retry={()=>d.refreshWork()}/>{d.workLoading?<p className="inset" role="status">Đang tải công...</p>:!d.workError&&<WorkRows rows={d.work.filter(w=>w.classId===id)}/>}</section>
      <Feedback error={historicError} retry={()=>setHistoricReload(n=>n+1)}/>{!!historic.length&&<details className="historic-records"><summary>Buổi dạy trước khi dùng tài khoản cá nhân ({historic.length})</summary><p className="muted">Giữ nguyên để đối chiếu. Buổi đã xác nhận vẫn được tính trong tổng công; không chấm lại suất đã có công cũ.</p>{historic.map(s=><article key={s.id}><strong>{dateLabel(s.date)} · {s.start_time} - {s.end_time}</strong><Badge value={s.status}/>{s.staff.map(p=><p key={p.id}>{p.teacher_name} · {p.role==='ta'?'Trợ giảng':'Dạy chính'}</p>)}{s.notes&&<p>{s.notes}</p>}</article>)}</details>}</>:null}
    </div>
    {tab==='info'&&<div className="teaching-columns">
      <section className="panel class-detail-panel">
        <PanelHead title="Lịch và phân công"><Button variant="secondary" icon={SlidersHorizontal} onClick={()=>d.classEditor(c)}>Sửa thông tin</Button></PanelHead>
        <ul className="teaching-slot-list">{classSchedule.map(slot=><li key={slot.label}>
          <div><strong>{WEEKDAYS[slot.day]}</strong><time>{slot.start}–{slot.end}</time></div>
          <p>Giáo viên: {slot.teacher||'Chưa phân công'}</p><p>Trợ giảng: {slot.ta||'Chưa phân công'}</p>
        </li>)}</ul>
        {!classSchedule.length&&<p className="inset">Chưa xếp lịch.</p>}
      </section>
      <section className="panel">
        <PanelHead title={`${students.length} học sinh`} caption={c.capacity ? `Sức chứa: ${c.capacity}` : 'Không giới hạn sĩ số'}/>
        <ul className="class-roster-list">{students.map(student=><li key={student.id}>
          <span>{student.name}</span><Button variant="ghost" onClick={()=>d.removeStudent(id, student)}>Bỏ khỏi lớp</Button>
        </li>)}</ul>
        <div className="panel-foot"><Button variant="secondary" onClick={()=>d.enrollEditor(id)}>Thêm vào lớp</Button><Button variant="ghost" onClick={()=>d.studentEditor()}>Tạo hồ sơ mới</Button></div>
      </section>
    </div>}
    {tab==='notes'&&<ClassNotes classId={id} selectedDate={lessonDate}/>}
  </>;
}

export function Students() {
  const d=useCenter();const [query,setQuery]=useState('');const [classId,setClassId]=useState('');
  const rows=d.students.filter(s=>matches(`${s.name} ${s.phone||''} ${s.parentName||''} ${s.parentPhone||''}`,query)&&(!classId||(classId==='none'?!d.classesOf(s.id).length:d.classesOf(s.id).some(c=>c.id===Number(classId)))));
  const exportRows=()=>downloadCsv('Danh-sach-hoc-sinh.csv',[['Mã','Họ tên','Điện thoại học sinh','Phụ huynh','Điện thoại phụ huynh','Các lớp'],...rows.map(s=>[s.id,s.name,s.phone,s.parentName,s.parentPhone,d.classesOf(s.id).map(c=>c.name).join(', ')])]);
  return <><PageHead title="Học sinh"><Button variant="secondary" icon={Download} disabled={!rows.length} onClick={exportRows}>Xuất danh sách</Button><Button icon={UserRoundPlus} onClick={()=>d.studentEditor()}>Thêm học sinh</Button></PageHead><div className="filters"><Find value={query} onChange={setQuery} placeholder="Tìm học sinh, phụ huynh, điện thoại..."/><Select label="Lớp" value={classId} onChange={e=>setClassId(e.target.value)}><option value="">Tất cả lớp</option><option value="none">Chưa xếp lớp</option>{d.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select><span className="result-count">{rows.length} học sinh</span></div><div className="panel table-panel"><table className="responsive-table"><thead><tr><th>Học sinh</th><th>Các lớp đang học</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{rows.map(s=><tr key={s.id}><td data-label="Học sinh"><div className="table-person"><Avatar name={s.name}/><div><strong>{s.name}</strong><small>HS{String(s.id).padStart(3,'0')}</small></div></div></td><td data-label="Lớp"><div className="tag-list">{d.classesOf(s.id).map(c=><ClassTag key={c.id} cls={c}/>)}{!d.classesOf(s.id).length&&<span className="muted">Chưa xếp lớp</span>}</div></td><td><Button variant="ghost small" onClick={()=>d.studentEditor(s)}>Xem hồ sơ</Button></td></tr>)}</tbody></table>{!rows.length&&<Empty title="Không có học sinh phù hợp" text="Thử bỏ bộ lọc hoặc tìm bằng tên khác."/>}</div></>;
}

export function Teachers() {
  const d=useCenter();const [query,setQuery]=useState('');const [role,setRole]=useState('');const rows=d.teachers.filter(t=>matches(`${t.name} ${t.username||''} ${t.phone||''}`,query)&&(!role||Number(role)===Number(t.role)));
  return <><PageHead title="Giáo viên & trợ giảng" ><Button icon={Plus} onClick={()=>d.teacherEditor()}>Thêm nhân sự</Button></PageHead><div className="filters"><Find value={query} onChange={setQuery} placeholder="Tìm tên, tài khoản, điện thoại..."/><Select label="Vai trò" value={role} onChange={e=>setRole(e.target.value)}><option value="">Tất cả nhân sự</option><option value="1">Giáo viên</option><option value="2">Trợ giảng</option></Select><span className="result-count">{rows.length} nhân sự</span></div><section className="panel"><div className="teacher-list">{rows.map(t=><article className="teacher-row" key={t.id}><Avatar name={t.name} large/><div className="teacher-name"><h2>{t.name}</h2><p>{roleLabel(t.role)} · {t.username||'Chưa có tài khoản'}</p>{t.phone&&<p>{t.phone}</p>}</div><div className="teacher-classes">{d.classes.filter(c=>classStaff(c).some(s=>s.teacher===t.name||s.ta===t.name)).map(c=><ClassTag key={c.id} cls={c}/>)}{!d.classes.some(c=>classStaff(c).some(s=>s.teacher===t.name||s.ta===t.name))&&<span className="muted">Chưa phân công lớp</span>}</div><Button variant="secondary small" onClick={()=>d.teacherEditor(t)}>Sửa hồ sơ</Button><Button variant="ghost small danger" onClick={()=>d.deleteTeacher(t)}>Xóa</Button></article>)}</div>{!rows.length&&<Empty title="Không tìm thấy nhân sự"/>}</section><div className="info-line"><Icon icon={UserRound}/><p>Thêm giáo viên sẽ tạo tài khoản không dấu viết liền, mật khẩu ban đầu kidit. Admin đổi thông tin đăng nhập trong mục Tài khoản.</p></div></>;
}

function WorkRows({ rows }) {
  const center = useCenter();
  if (center.role === 'admin' && rows.length) return <div className="admin-work-grid">{rows.map(w => <article className="admin-work-card" key={w.id}>
    <header><ClassTag cls={center.cls(w.classId)}/><Badge value={w.status}/></header>
    <div className="admin-work-person"><strong>{w.teacherName || center.person(w.teacherId)}</strong><span>{w.role}{w.source === 'historic' ? ' · Công cũ' : ''}</span></div>
    <p className="admin-work-time">{dateLabel(w.date)} · {w.start}–{w.end}</p>
    <h3>{w.lesson}</h3>
    <PayRecordNote row={w}/>
    <details><summary>Chi tiết{w.notes ? ' · Có ghi chú' : ''}</summary><div className="admin-work-details"><p>{w.lesson}</p>{w.pay_rate != null ? <p>{w.teacher_count} giáo viên + {w.ta_count} trợ giảng · {w.pay_basis !== 'staffing' ? `${w.pay_basis === 'override' ? 'Đơn giá riêng' : 'Đơn giá lớp'}: ${money(w.pay_rate)} / người / suất` : `${money(w.pay_rate * 8)} / 8 = ${money(w.pay_rate)} / người / buổi`}</p> : <p>Cần bổ sung đội hình thực tế để tính lương.</p>}{w.recorded_by && <p>Admin ghi / sửa hộ: {w.recorded_by}</p>}{w.notes && <p className="preserve-lines">{w.notes}</p>}</div></details>
    <footer><div><strong>{w.pay_amount == null ? 'Chưa đủ dữ liệu' : money(w.pay_amount)}</strong><small>{w.status === 'completed' ? '1 công / suất' : w.status === 'draft' ? 'Dự kiến, chưa tính công' : 'Không tính công'}</small></div>{w.source === 'personal' && <Button variant="ghost small" onClick={() => center.addWork(w.classId,w.date,w)}>Sửa công</Button>}</footer>
  </article>)}</div>;
  const d=center;return rows.length?<div className="work-list">{rows.map(w=><article className="work-row" key={w.id}>
    <div className="work-date"><strong>{w.date.slice(8)}</strong><span>{w.date.slice(5,7)}/{w.date.slice(0,4)}</span></div>
    <div className="work-info"><div><ClassTag cls={d.cls(w.classId)}/><span className="muted">{w.start} - {w.end}</span></div><h3>{w.lesson}</h3><p>{w.teacherName||d.person(w.teacherId)} · {w.role}{w.source==='historic'?' · Công cũ đã xác nhận':''}</p>
      <details className="work-record-detail"><summary>Chi tiết suất</summary>{w.pay_rate!=null?<p>{w.teacher_count} giáo viên + {w.ta_count} trợ giảng · {w.pay_basis !== 'staffing' ? `${w.pay_basis === 'override' ? 'Đơn giá riêng' : 'Đơn giá lớp'}: ${money(w.pay_rate)} / người / suất` : `${money(w.pay_rate*8)} / 8 = ${money(w.pay_rate)} / người / buổi`}</p>:<p>Cần bổ sung đội hình thực tế để tính lương.</p>}
      <PayRecordNote row={w}/>{w.recorded_by&&<p>Admin ghi / sửa hộ: {w.recorded_by}</p>}{w.notes&&<p className="preserve-lines">{w.notes}</p>}</details></div>
    <div className="work-status"><Badge value={w.status}/><span>{w.status==='completed'?'1 công / suất':w.status==='draft'?'Dự kiến, chưa tính công':'Không tính công'}</span><strong className="work-pay">{w.pay_amount==null?'Chưa đủ dữ liệu':money(w.pay_amount)}</strong></div>
    {w.source==='personal'&&(w.teacherId===d.user.id||d.role==='admin')&&<div className="work-actions"><Button variant="ghost small" onClick={()=>d.addWork(w.classId,w.date,w)}>{w.status==='draft'?'Mở bản nháp':'Sửa công'}</Button>{w.teacherId===d.user.id&&<Button variant="ghost small danger" onClick={()=>d.deleteWork(w)}>Xóa buổi</Button>}</div>}
  </article>)}</div>:<Empty title="Chưa có công theo bộ lọc này" text="Thử thay đổi tháng hoặc ghi công sau buổi dạy." action={d.user.id&&<Button onClick={()=>d.addWork()}>Ghi công của tôi</Button>}/>;
}

function PayRecordNote({ row }) {
  return <>{row.staffing_warning && <p className="payment-missing" role="status">{row.staffing_warning}</p>}{row.pay_frozen && <p className="muted">Tiền đã chốt{row.pay_basis === 'override' ? ' · Đơn giá riêng' : ''}. Admin chọn tính lại nếu cần đổi tiền.</p>}{row.override_reason && <p>Lý do đơn giá riêng: {row.override_reason}</p>}{row.single_teacher && <p>Một người dạy thay đội hình hai giáo viên.</p>}</>;
}

function PayTotal({ rows, label }) {
  const total=summarizePay(rows);
  return <div className="pay-total"><span>{label}</span><b>{money(total.amount)}</b>{total.missing>0&&<small>Còn {total.missing} suất chưa đủ đội hình, chưa cộng tiền.</small>}</div>;
}

export function Payroll() {
  const d=useCenter();const [tab,setTab]=useViewState('payroll-tab',d.role==='admin'?'matrix':'mine');const [teacher,setTeacher]=useViewState('payroll-person','');const [status,setStatus]=useViewState('payroll-status','');
  const [classId,setClassId]=useViewState('payroll-class','');
  const legacy=d.legacy.filter(row=>!classId||Number(row.class_id)===Number(classId));
  const rows=d.work.filter(w=>(tab==='all'||w.teacherId===d.user.id)&&(!teacher||w.teacherId===Number(teacher))&&(!classId||w.classId===Number(classId))&&(!status||w.status===status));const completed=rows.filter(w=>w.status==='completed');
  const people=Array.from(new Map(d.work.map(w=>[w.teacherId,w.teacherName||d.person(w.teacherId)])).entries());
  const exportRows=()=>downloadCsv(`Bang-cong-${d.month}.csv`,[['Ngày','Lớp','Bắt đầu','Kết thúc','Mã giáo viên','Người dạy','Vai trò','Trạng thái','Số công (suất)','Số giáo viên','Số trợ giảng','Đơn giá / buổi (đ)','Tiền lương (đ)','Bài học','Ghi chú'],...rows.map(w=>[w.date,d.cls(w.classId)?.name||w.class_name,w.start,w.end,w.teacherId,w.teacherName,w.role,workStatus[w.status]?.[0],w.status==='completed'?1:0,w.teacher_count??'',w.ta_count??'',w.pay_rate??'Chưa đủ đội hình',w.pay_amount??'Chưa đủ đội hình',w.lesson,w.notes])]);
  return <><PageHead title={d.role==='admin'?'Sổ công giảng dạy':'Công của tôi'}>{!['payments','rates','matrix'].includes(tab)&&<Button variant="secondary" icon={Download} disabled={d.workLoading||!!d.workError||!rows.length} onClick={exportRows}>Xuất bảng công</Button>}{(d.user.id||d.role==='admin')&&<Button icon={Plus} onClick={()=>d.addWork()}>{d.role==='admin'?'Chấm công cho giáo viên':'Ghi công'}</Button>}</PageHead><div className="page-tabs">{d.role==='admin'&&<button aria-pressed={tab==='matrix'} className={tab==='matrix'?'active':''} onClick={()=>setTab('matrix')}>Bảng công theo lớp</button>}{d.user.id&&<button aria-pressed={tab==='mine'} className={tab==='mine'?'active':''} onClick={()=>{setTab('mine');setTeacher('');}}>Công của tôi</button>}<button aria-pressed={tab==='all'} className={tab==='all'?'active':''} onClick={()=>setTab('all')}>Tổng công toàn trung tâm</button>{d.role==='admin'&&<><button aria-pressed={tab==='rates'} className={tab==='rates'?'active':''} onClick={()=>setTab('rates')}>Phát lương</button><button aria-pressed={tab==='payments'} className={tab==='payments'?'active':''} onClick={()=>setTab('payments')}>Tổng thanh toán</button></>}</div>
    {['all','mine'].includes(tab)&&<div>
    <div className="payroll-summary"><div><p>{tab==='mine'?'Công đã xác nhận của bạn':'Tổng công đã xác nhận'}</p><strong>{d.workLoading||d.workError?'…':String(completed.length).padStart(2,'0')}<small>suất</small></strong>{!d.workLoading&&!d.workError&&<PayTotal rows={completed} label="Tiền lương đã xác nhận"/>}</div><div><p>Chưa xác nhận</p><strong>{d.workLoading||d.workError?'…':String(rows.filter(w=>w.status==='draft').length).padStart(2,'0')}<small>suất</small></strong>{!d.workLoading&&!d.workError&&<PayTotal rows={rows.filter(w=>w.status==='draft')} label="Tiền lương dự kiến"/>}</div><details className="workspace-disclosure payroll-note"><summary>Cách tính công</summary><p>Công nháp hiển thị tiền dự kiến. Buổi hủy nhận 0đ. Đơn giá theo đội hình từng suất.</p></details></div>
    <div className="filters"><label className="inline-date">Tháng<input aria-label="Tháng bảng công" type="month" value={d.month} onChange={e=>e.target.value&&d.setMonth(e.target.value)}/></label><Select label="Lớp học" value={classId} onChange={e=>setClassId(e.target.value)}><option value="">Tất cả lớp</option>{d.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select>{tab==='all'&&<Select label="Giáo viên" value={teacher} onChange={e=>setTeacher(e.target.value)}><option value="">Tất cả nhân sự</option>{people.map(([id,name])=><option key={id} value={id}>{name} (#{id})</option>)}</Select>}<Select label="Trạng thái" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(workStatus).map(([value,[label]])=><option key={value} value={value}>{label}</option>)}</Select><Button variant="ghost small" onClick={()=>d.refreshWork()}>Tải lại</Button></div><Feedback error={d.workError} retry={()=>d.refreshWork()}/>
    {d.workLoading?<p role="status">Đang tổng hợp công...</p>:!d.workError&&<>{tab==='all'&&<section className="panel summary-table"><PanelHead title="Theo từng giáo viên" caption="Tách lương đã xác nhận và lương dự kiến."/><div className="summary-grid">{people.filter(([id])=>rows.some(w=>w.teacherId===id)).map(([id,name])=><div className="person-pay-summary" key={id}><Avatar name={name}/><span>{name}</span><strong>{completed.filter(w=>w.teacherId===id).length}<small> công</small></strong><PayTotal rows={completed.filter(w=>w.teacherId===id)} label="Đã xác nhận"/><PayTotal rows={rows.filter(w=>w.teacherId===id&&w.status==='draft')} label="Dự kiến"/></div>)}</div>{!rows.length&&<p className="inset muted">Chưa có công theo bộ lọc.</p>}</section>}<section className="panel"><PanelHead title="Chi tiết suất dạy" caption="Đội hình, cách tính và tiền lương cho từng người trong mỗi suất."/><WorkRows rows={rows}/></section>{!!legacy.length&&<details className="historic-records"><summary>Điểm danh cũ cần đối chiếu ({legacy.length} dòng, chưa tính công)</summary><p>Dữ liệu cũ thiếu giờ ca, không tự cộng vào tổng công.</p>{legacy.map(row=><p key={row.id}>{dateLabel(row.date)} · <Link className="text-link" to={`/classes/${row.class_id}`}>{row.class_name}</Link> · {row.teacher_name} · {row.status==='present'?'Có mặt':'Vắng'}</p>)}</details>}</>}
    </div>}
    {tab==='matrix'&&d.role==='admin'&&<PayrollMatrix/>}
    {tab==='payments'&&d.role==='admin'&&<PaymentSummary/>}
    {tab==='rates'&&d.role==='admin'&&<PayRates/>}
  </>;
}

export function Finance() {
  const d=useCenter();const [query,setQuery]=useState('');const [status,setStatus]=useState('');const student=id=>d.students.find(s=>s.id===id);
  const rows=d.invoices.filter(i=>(!status||i.status===status)&&matches(`${student(i.studentId)?.name||i.student_name} ${i.invoice_code}`,query));
  const create=()=>d.open({title:'Tạo phiếu học phí',initial:{student_id:'',amount:'',status:'pending'},fields:[{key:'student_id',label:'Học sinh',type:'select',full:true,required:true,options:[{value:'',label:'Chọn học sinh'},...d.students.map(s=>({value:s.id,label:`${s.name} (#${s.id})`}))]},{key:'amount',label:'Số tiền (đồng)',type:'number',min:1,required:true},{key:'status',label:'Trạng thái',type:'select',options:Object.entries(invoiceStatus).map(([value,[label]])=>({value,label}))}],validate:v=>!Number.isSafeInteger(Number(v.amount))||Number(v.amount)<=0?'Số tiền phải là số nguyên dương.':'',save:async v=>{await api('/api/invoices',jsonBody({student_id:Number(v.student_id),amount:Number(v.amount),status:v.status}));await d.refreshFinance();d.notify('Đã tạo phiếu học phí.');}});
  return <><PageHead title="Học phí" ><Button icon={Plus} onClick={create}>Tạo phiếu học phí</Button></PageHead><Feedback error={d.financeError} retry={()=>d.refreshFinance()}/>{d.financeLoading?<p role="status">Đang tải học phí...</p>:!d.financeError&&<><div className="finance-summary">{[['paid','Đã thu','good'],['pending','Chờ thu','wait'],['overdue','Quá hạn','danger']].map(([value,label,tone])=><button key={value} className={status===value?'chosen':''} onClick={()=>setStatus(v=>v===value?'':value)}><span className={tone}>{label}</span><strong>{money(d.invoices.filter(i=>i.status===value).reduce((n,i)=>n+i.amount,0))}</strong><small>{d.invoices.filter(i=>i.status===value).length} phiếu</small></button>)}</div><div className="filters"><Find value={query} onChange={setQuery} placeholder="Tìm tên học sinh, mã phiếu..."/><Select label="Trạng thái" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Tất cả phiếu</option>{Object.entries(invoiceStatus).map(([v,[label]])=><option key={v} value={v}>{label}</option>)}</Select><span className="result-count">{rows.length} phiếu</span></div><section className="panel table-panel"><table className="responsive-table"><thead><tr><th>Học sinh / mã phiếu</th><th>Ngày lập</th><th>Số tiền</th><th>Trạng thái</th><th><span className="sr-only">Chi tiết</span></th></tr></thead><tbody>{rows.map(i=><tr key={i.id}><td data-label="Học sinh"><strong>{student(i.studentId)?.name||i.student_name}</strong><small>{i.invoice_code}</small></td><td data-label="Ngày lập">{dateLabel(i.date)}</td><td data-label="Số tiền"><strong className="amount">{money(i.amount)}</strong></td><td data-label="Trạng thái"><Badge type="invoice" value={i.status}/></td><td><Button variant="ghost small" onClick={()=>d.open({title:'Chi tiết phiếu học phí',content:<dl className="detail-dl"><dt>Mã phiếu</dt><dd>{i.invoice_code}</dd><dt>Học sinh</dt><dd>{student(i.studentId)?.name||i.student_name}</dd><dt>Số tiền</dt><dd>{money(i.amount)}</dd><dt>Ngày lập</dt><dd>{dateLabel(i.date)}</dd><dt>Trạng thái</dt><dd><Badge type="invoice" value={i.status}/></dd></dl>})}>Chi tiết</Button></td></tr>)}</tbody></table>{!rows.length&&<Empty title="Không có phiếu phù hợp" text="Thử đổi trạng thái, tên học sinh hoặc tạo phiếu mới."/>}</section></>}</>;
}

export function Accounts() {
  const d=useCenter();const [accounts,setAccounts]=useState([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [query,setQuery]=useState('');const [reload,setReload]=useState(0);
  useEffect(()=>{if(d.role!=='admin')return;const controller=new AbortController();setLoading(true);setError('');api('/api/accounts',{signal:controller.signal}).then(setAccounts).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[d.role,d.teachers,reload]);
  if(d.role!=='admin')return <Empty title="Quản lý tài khoản dành cho admin" text="Giáo viên vẫn sử dụng đầy đủ các chức năng quản lý và tự chấm công."/>;
  const rows=accounts.filter(a=>matches(`${a.name} ${a.username}`,query));
  return <><PageHead title="Tài khoản" ><Button icon={UserRoundPlus} disabled={loading} onClick={()=>d.accountEditor(null,accounts)}>Tạo tài khoản giáo viên</Button></PageHead><div className="account-guidance"><Icon icon={Settings2} size={24}/><div><h2>Cách tạo tài khoản</h2><p>Thêm giáo viên sẽ tạo tên đăng nhập không dấu viết liền, mật khẩu ban đầu <strong>kidit</strong>. Admin có thể đổi thông tin bên dưới.</p></div></div><div className="filters"><Find value={query} onChange={setQuery} placeholder="Tìm giáo viên, tên đăng nhập..."/><Button variant="secondary" onClick={()=>setReload(n=>n+1)}>Tải lại</Button><span className="result-count">{rows.length} tài khoản</span></div><Feedback error={error} retry={()=>setReload(n=>n+1)}/>{loading?<p role="status">Đang tải tài khoản...</p>:!error&&<section className="panel table-panel"><table className="responsive-table"><thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Quyền sử dụng</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td><div className="table-person"><Avatar name={a.name}/><strong>{a.name}</strong></div></td><td data-label="Tên đăng nhập"><span className="login-name">{a.username}</span></td><td data-label="Quyền">{a.role==='admin'?'Admin':'Giáo viên'}</td><td><Button variant="secondary small" onClick={()=>d.accountEditor(a,accounts)}>Đổi tên / mật khẩu</Button></td></tr>)}</tbody></table>{!rows.length&&<Empty title="Không tìm thấy tài khoản"/>}</section>}</>;
}
