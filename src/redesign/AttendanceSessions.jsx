import { useEffect, useState } from 'react';
import { api, jsonBody, localDate } from '../lib/api';
import { useCenter } from './center-context';
import { useViewState } from './useViewState';
import { Button, Feedback, Empty, PanelHead } from './ui';
import Classroom from './Classroom';
import { DateFields } from '../components/DateFields';
import './attendance-sessions.css';

export default function AttendanceSessions({ cls, date, onDateChange }) {
  const d = useCenter();
  const [data, setData] = useState(null);
  const [loadedDate, setLoadedDate] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const [drafts, setDrafts] = useViewState(`class-${cls.id}-attendance-drafts`, {});
  const [savedMessage, setSavedMessage] = useState('');
  const hasDrafts = Object.values(drafts).some(rows => Object.keys(rows).length);
  const [view, setView] = useViewState(`class-${cls.id}-view`, 'list');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLoadError('');
    if (!date) { setLoading(false); return () => controller.abort(); }
    api(`/api/classes/${cls.id}/attendance-sessions?date=${date}`, { signal: controller.signal }).then(next => {
      if (!controller.signal.aborted) { setData(next); setLoadedDate(date); }
    }).catch(err => { if (!controller.signal.aborted) setLoadError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cls.id, date, reload]);
  useEffect(() => { setError(''); setConfirmClose(false); }, [cls.id, date]);
  useEffect(() => {
    if (busy || hasDrafts) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') setReload(n => n + 1); }, 30000);
    return () => clearInterval(timer);
  }, [busy, hasDrafts]);
  useEffect(() => {
    if (!hasDrafts) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasDrafts]);
  const ready = loadedDate === date && !!data;
  const sessions = ready ? data.sessions : [];
  const session = sessions.find(s => s.id === selected) || sessions.find(s => s.state === 'open') || sessions.at(-1);
  const draft = drafts[session?.id] || {};
  const changes = Object.values(draft);
  const entries = (session?.entries || []).map(entry => draft[entry.student_id] ? { ...entry, status: draft[entry.student_id].status, marked_by: 'Chưa lưu' } : entry);
  const count = status => entries.filter(e => e.status === status).length;
  const editable = !!session?.can_manage && session.state === 'open' && !busy && !loading && ready;
  const act = async fn => {
    setBusy(true); setError('');
    try { await fn(); setConfirmClose(false); setReload(n => n + 1); }
    catch (err) { setError(err.message); if (err.status === 409) setReload(n => n + 1); }
    finally { setBusy(false); }
  };
  const mark = (studentId, status) => {
    if (!editable) return;
    const entry = session.entries.find(e => e.student_id === studentId);
    setError(''); setSavedMessage(''); setConfirmClose(false);
    setDrafts(current => {
      const rows = { ...current[session.id] };
      const original = rows[studentId] || { student_id: studentId, version: entry.version, originalStatus: entry.status };
      if (status === original.originalStatus) delete rows[studentId];
      else rows[studentId] = { ...original, status };
      return { ...current, [session.id]: rows };
    });
  };
  const discard = () => {
    setDrafts(current => { const next = { ...current }; delete next[session.id]; return next; });
    setError(''); setSavedMessage(''); setReload(n => n + 1);
  };
  const save = async () => {
    if (!editable || !changes.length) return;
    setBusy(true); setError(''); setSavedMessage('');
    try {
      await api(`/api/classes/${cls.id}/attendance-sessions/${session.id}/students/bulk`, jsonBody({ entries: changes.map(({ student_id, status, version }) => ({ student_id, status, version })) }));
      setDrafts(current => { const next = { ...current }; delete next[session.id]; return next; });
      setLoadedDate(''); setReload(n => n + 1);
      setSavedMessage(`Đã lưu điểm danh cho ${changes.length} học sinh.`);
    } catch (err) {
      setError(err.status === 409 ? `${err.message} Lựa chọn của bạn vẫn được giữ. Bấm Hủy thay đổi để tải kết quả mới nhất trước khi chọn lại.` : `${err.message} Lựa chọn của bạn vẫn được giữ, hãy thử lưu lại.`);
    } finally { setBusy(false); }
  };
  return <section className="panel attendance-sessions">
    <PanelHead title="Phiên điểm danh học sinh" caption="Chọn trạng thái cho các học sinh, sau đó bấm Lưu điểm danh một lần cho cả lượt.">
      <DateFields label="Ngày phiên điểm danh" value={date} disabled={busy} onChange={value => { setSelected(null); onDateChange(value); }}/>
    </PanelHead>
    <div className="session-toolbar"><Button variant="secondary" disabled={busy} onClick={() => { setSelected(null); onDateChange(localDate()); setReload(n => n + 1); }}>Hôm nay</Button><Button variant="ghost" disabled={busy || loading} onClick={() => { setError(''); setReload(n => n + 1); }}>Tải lại phiên</Button></div>
    <Feedback error={error || loadError}/>
    {savedMessage && <p className="inset" role="status">{savedMessage}</p>}
    {loading && <p className="inset" role="status">Đang tải các phiên điểm danh...</p>}
    {ready && <>
      <div className="session-slots" aria-label="Suất học trong ngày">{data.slots.map(slot => {
        const saved = sessions.find(s => s.start_time === slot.start_time);
        return <div className="session-slot" key={slot.label}><div><strong>{slot.start_time} - {slot.end_time}</strong><small>{saved ? saved.state === 'open' ? 'Phiên đang mở' : 'Phiên đã đóng' : 'Chưa mở phiên'}</small></div>{saved ? <Button variant="secondary" disabled={busy} onClick={() => { setSelected(saved.id); setConfirmClose(false); }}>Xem phiên {slot.start_time}</Button> : <Button disabled={!slot.can_open || busy || loading} onClick={() => act(async () => {
          const result = await api(`/api/classes/${cls.id}/attendance-sessions`, jsonBody({ date, start_time: slot.start_time, end_time: slot.end_time })); setSelected(result.id);
        })}>Mở điểm danh {slot.start_time}</Button>}</div>;
      })}</div>
      {!!data.slots.length && <p className="inset muted">Admin hoặc nhân sự được phân công có thể mở phiên trong giờ diễn ra suất học (giờ Việt Nam). Học sinh ban đầu đều là Chưa điểm danh.</p>}
      {!data.slots.length && !sessions.length && <Empty title="Ngày này chưa có suất học" text="Chọn ngày có lịch hoặc cập nhật lịch của lớp."/>}
      {!!sessions.length && <label className="session-chooser">Phiên cần xem<select aria-label="Chọn phiên điểm danh" value={session?.id || ''} disabled={busy} onChange={e => { setSelected(Number(e.target.value)); setConfirmClose(false); }}>{sessions.map(s => <option key={s.id} value={s.id}>{s.start_time} - {s.end_time} · {s.state === 'open' ? 'Đang mở' : 'Đã đóng'}</option>)}</select></label>}
      {session ? <>
        <div className="session-state"><div><h3>{session.start_time} - {session.end_time} · {session.state === 'open' ? 'Đang mở điểm danh' : 'Đã đóng phiên'}</h3><p>Người mở: {session.opened_name}. Danh sách chốt tại thời điểm mở phiên.</p></div>{session.state === 'open' && session.can_manage && <Button variant="secondary" disabled={busy || loading || !!changes.length} onClick={() => setConfirmClose(true)}>Đóng phiên</Button>}{session.state === 'closed' && session.can_reopen && <Button variant="secondary" disabled={busy || loading} onClick={() => act(() => api(`/api/classes/${cls.id}/attendance-sessions/${session.id}/reopen`, jsonBody({ version: session.version })))}>Mở lại phiên</Button>}</div>
        {confirmClose && <div className="session-close-confirm"><p>{count('pending') ? `Còn ${count('pending')} học sinh chưa điểm danh. Đóng phiên vẫn giữ nguyên trạng thái này.` : 'Đóng phiên sẽ khóa việc sửa điểm danh. Admin có thể mở lại khi cần.'}</p><Button disabled={busy || loading} onClick={() => act(() => api(`/api/classes/${cls.id}/attendance-sessions/${session.id}/close`, jsonBody({ version: session.version })))}>Xác nhận đóng phiên</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirmClose(false)}>Tiếp tục điểm danh</Button></div>}
        <div className="attendance-summary" aria-live="polite"><span><strong>{count('present')}</strong> có mặt</span><span><strong>{count('absent')}</strong> vắng</span><span><strong>{count('pending')}</strong> chưa điểm danh</span></div>
        {(session.can_manage || !!changes.length) && <div className="session-save-bar"><p role="status">{changes.length ? `${changes.length} học sinh có thay đổi chưa lưu. Lưu trước khi đóng phiên.` : 'Chọn Có mặt hoặc Vắng cho từng học sinh, rồi lưu cả lượt.'}</p><div><Button variant="secondary" disabled={busy || !changes.length} onClick={discard}>Hủy thay đổi</Button><Button disabled={!editable || !changes.length} onClick={save}>{busy ? 'Đang lưu...' : 'Lưu điểm danh'}</Button></div></div>}
        {!session.can_manage && <p className="inset muted">Bạn đang xem kết quả. Chỉ nhân sự của phiên hoặc admin được chấm và đóng phiên.</p>}
        <div className="attendance-view-controls"><div className="segmented" aria-label="Cách xem phiên điểm danh"><button aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách</button><button aria-pressed={view === 'room'} onClick={() => setView('room')}>Phòng học 3D</button></div></div>
        {view === 'room' ? <Classroom className={cls.name} date={`${date} · ${session.start_time} - ${session.end_time}`} students={entries.map(e => ({ id: e.student_id, name: e.student_name }))} attendance={Object.fromEntries(entries.map(e => [e.student_id, e.status]))} disabled={busy || loading || !ready} readOnly={session.state !== 'open' || !session.can_manage} onPresent={id => mark(id, 'present')} onAbsent={id => mark(id, 'absent')}/> : <div className="attendance-list">{entries.map((entry, index) => <div className="attendance-row" key={entry.id}><span className="row-number">{index + 1}</span><div className="session-student"><strong>{entry.student_name}</strong><small>{entry.status === 'present' ? 'Có mặt' : entry.status === 'absent' ? 'Vắng' : 'Chưa điểm danh'}{entry.marked_by && ` · ${entry.marked_by}`}</small></div><div className="attendance-buttons"><button disabled={!editable} aria-pressed={entry.status === 'present'} className={entry.status === 'present' ? 'present' : ''} onClick={() => mark(entry.student_id, 'present')}>Có mặt</button><button disabled={!editable} aria-pressed={entry.status === 'absent'} className={entry.status === 'absent' ? 'absent' : ''} onClick={() => mark(entry.student_id, 'absent')}>Vắng</button><button disabled={!editable || entry.status === 'pending'} onClick={() => mark(entry.student_id, 'pending')}>Bỏ đánh dấu</button></div></div>)}</div>}
      </> : !!data.slots.length && <p className="inset">Chọn Mở điểm danh khi bắt đầu suất học để tạo phiên.</p>}
      {!!data.legacy.length && <details className="historic-records"><summary>Điểm danh cũ theo ngày ({data.legacy.length} học sinh)</summary><p>Dữ liệu cũ được giữ riêng để đối chiếu, chưa gán vào phiên vì một ngày có thể có nhiều suất.</p>{data.legacy.map(e => <p key={e.student_id}>{e.student_name || `HS${e.student_id}`} · {e.status === 'present' ? 'Có mặt' : 'Vắng'}</p>)}</details>}
    </>}
    <details className="historic-records"><summary>Quản lý học sinh hiện tại của lớp ({d.roster(cls.id).length})</summary><p>Thêm hoặc bỏ học sinh khỏi lớp không thay đổi danh sách của phiên đã mở.</p>{d.roster(cls.id).map(student => <div className="session-current-student" key={student.id}><span>{student.name}</span><Button variant="ghost small" disabled={busy} onClick={() => d.removeStudent(cls.id, student)}>Bỏ khỏi lớp</Button></div>)}</details>
    <div className="panel-foot"><span>Học sinh thêm vào lớp sau khi mở phiên sẽ có trong phiên tiếp theo.</span><Button variant="ghost small" disabled={busy} onClick={() => d.enrollEditor(cls.id)}>Thêm học sinh vào lớp</Button><Button variant="ghost small" disabled={busy} onClick={() => d.studentEditor()}>Tạo hồ sơ mới</Button></div>
  </section>;
}
