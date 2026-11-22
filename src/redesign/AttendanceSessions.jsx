import { useEffect, useState } from 'react';
import { api, jsonBody } from '../lib/api';
import { useViewState } from './useViewState';
import { Button, Feedback, Empty, PanelHead } from './ui';
import Classroom from './Classroom';
import { DateFields } from '../components/DateFields';
import './attendance-sessions.css';

export default function AttendanceSessions({ cls, date, requestedSlot, onDateChange }) {
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
  useEffect(() => { setError(''); setConfirmClose(false); }, [cls.id, date, requestedSlot]);
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
  const keyFor = row => `${row.start_time}-${row.end_time}`;
  const choices = ready ? [...new Map([...data.slots, ...sessions].map(row => [keyFor(row), row])).values()]
    .sort((a,b) => a.start_time.localeCompare(b.start_time)) : [];
  const preferredKey = selected || requestedSlot;
  const activeKey = choices.some(row => keyFor(row) === preferredKey)
    ? preferredKey
    : keyFor(sessions.find(s => s.state === 'open') || choices.at(-1) || {});
  const slot = ready && data.slots.find(row => keyFor(row) === activeKey);
  const session = sessions.find(row => keyFor(row) === activeKey);
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
    <PanelHead title="Điểm danh học sinh">
      <DateFields label="Ngày phiên điểm danh" value={date} disabled={busy} onChange={value => { setSelected(null); setSavedMessage(''); onDateChange(value); }}/>
    </PanelHead>
    <Feedback error={error || loadError} retry={loadError ? () => setReload(n => n + 1) : undefined}/>
    {savedMessage && <p className="inset" role="status">{savedMessage}</p>}
    {loading && <p className="inset" role="status">Đang tải các phiên điểm danh...</p>}
    {ready && <>
      {!!choices.length && <div className="session-slot-bar">
        {choices.length > 1 ? <label className="session-chooser">Suất học
          <select value={activeKey} disabled={busy} onChange={e => { setSelected(e.target.value); setConfirmClose(false); setSavedMessage(''); }}>
            {choices.map(row => <option key={keyFor(row)} value={keyFor(row)}>{row.start_time}–{row.end_time}</option>)}
          </select>
        </label> : <strong>{choices[0].start_time}–{choices[0].end_time}</strong>}
        {!session && slot && <div>
          <Button disabled={!slot.can_open || busy || loading} onClick={() => act(() =>
            api(`/api/classes/${cls.id}/attendance-sessions`, jsonBody({ date, start_time: slot.start_time, end_time: slot.end_time }))
          )}>Mở điểm danh</Button>
          {!slot.can_open && <p className="muted">Chỉ người được phân công hoặc quản trị viên có thể mở trong giờ học.</p>}
        </div>}
      </div>}
      {!choices.length && <Empty title="Ngày này chưa có suất học" text="Chọn ngày khác để xem hoặc mở điểm danh."/>}
      {session ? <div className="attendance-workspace">
        <aside className="attendance-sidebar">
        <div className="session-state"><div><h3>{session.state === 'open' ? 'Đang mở' : 'Đã đóng'}</h3><details><summary>Chi tiết phiên</summary><p>Người mở: {session.opened_name}. Danh sách chốt khi mở phiên.</p></details></div>{session.state === 'open' && session.can_manage && <Button variant="secondary" disabled={busy || loading || !!changes.length} onClick={() => setConfirmClose(true)}>Đóng phiên</Button>}{session.state === 'closed' && session.can_reopen && <Button variant="secondary" disabled={busy || loading} onClick={() => act(() => api(`/api/classes/${cls.id}/attendance-sessions/${session.id}/reopen`, jsonBody({ version: session.version })))}>Mở lại phiên</Button>}</div>
        {confirmClose && <div className="session-close-confirm"><p>{count('pending') ? `Còn ${count('pending')} học sinh chưa điểm danh. Đóng phiên vẫn giữ nguyên trạng thái này.` : 'Đóng phiên sẽ khóa việc sửa điểm danh. Admin có thể mở lại khi cần.'}</p><Button disabled={busy || loading} onClick={() => act(() => api(`/api/classes/${cls.id}/attendance-sessions/${session.id}/close`, jsonBody({ version: session.version })))}>Xác nhận đóng phiên</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirmClose(false)}>Tiếp tục điểm danh</Button></div>}
        <div className="attendance-summary" aria-live="polite"><span><strong>{count('present')}</strong> có mặt</span><span><strong>{count('absent')}</strong> vắng</span><span><strong>{count('pending')}</strong> chưa điểm danh</span></div>
        {((session.can_manage && session.state === 'open') || !!changes.length) && <div className="session-save-bar"><p role="status">{changes.length ? `${changes.length} học sinh có thay đổi chưa lưu. Lưu trước khi đóng phiên.` : 'Chưa có thay đổi.'}</p><div><Button variant="secondary" disabled={busy || !changes.length} onClick={discard}>Hủy thay đổi</Button><Button disabled={!editable || !changes.length} onClick={save}>{busy ? 'Đang lưu...' : 'Lưu điểm danh'}</Button></div></div>}
        {!session.can_manage && <p className="inset muted">Bạn đang xem kết quả. Chỉ nhân sự của phiên hoặc admin được chấm và đóng phiên.</p>}
        </aside>
        <div className="attendance-roster">
        <div className="attendance-view-controls"><h3>Danh sách học sinh</h3><Button variant="ghost" onClick={() => setView(view === 'list' ? 'room' : 'list')}>{view === 'list' ? 'Phòng học 3D' : 'Về danh sách'}</Button></div>
        {view === 'room' ? <Classroom className={cls.name} date={`${date} · ${session.start_time} - ${session.end_time}`} students={entries.map(e => ({ id: e.student_id, name: e.student_name }))} attendance={Object.fromEntries(entries.map(e => [e.student_id, e.status]))} disabled={busy || loading || !ready} readOnly={session.state !== 'open' || !session.can_manage} onPresent={id => mark(id, 'present')} onAbsent={id => mark(id, 'absent')}/> : <div className="attendance-list">{entries.map((entry, index) => <div className="attendance-row" key={entry.id}><span className="row-number">{index + 1}</span><div className="session-student"><strong>{entry.student_name}</strong><small>{entry.status === 'present' ? 'Có mặt' : entry.status === 'absent' ? 'Vắng' : 'Chưa điểm danh'}{entry.marked_by && ` · ${entry.marked_by}`}</small></div><div className="attendance-buttons"><button disabled={!editable} aria-pressed={entry.status === 'present'} className={entry.status === 'present' ? 'present' : ''} onClick={() => mark(entry.student_id, 'present')}>Có mặt</button><button disabled={!editable} aria-pressed={entry.status === 'absent'} className={entry.status === 'absent' ? 'absent' : ''} onClick={() => mark(entry.student_id, 'absent')}>Vắng</button>{editable && entry.status !== 'pending' && <button className="attendance-reset" onClick={() => mark(entry.student_id, 'pending')}>Bỏ đánh dấu</button>}</div></div>)}</div>}
        </div>
      </div> : null}
      {!!data.legacy.length && <details className="historic-records"><summary>Điểm danh cũ theo ngày ({data.legacy.length} học sinh)</summary><p>Dữ liệu cũ được giữ riêng để đối chiếu, chưa gán vào phiên vì một ngày có thể có nhiều suất.</p>{data.legacy.map(e => <p key={e.student_id}>{e.student_name || `HS${e.student_id}`} · {e.status === 'present' ? 'Có mặt' : 'Vắng'}</p>)}</details>}
    </>}

  </section>;
}
