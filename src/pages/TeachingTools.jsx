import { useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { CountdownTimer } from '../components/CountdownTimer';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { useToolStorage } from '../lib/useToolStorage';
import { makeGroups, parseNames } from '../../shared/teaching-tools';
import './TeachingTools.css';
import { QuizHost } from '../quiz/QuizHost';

const TOOLS = [ ['timer', 'Đếm ngược giờ'], ['picker', 'Bốc thăm học sinh'], ['groups', 'Chia nhóm'], ['scores', 'Bảng điểm thi đua'], ['quiz', 'Đấu trường trắc nghiệm'] ];
const newTeam = (name, members = []) => ({ id: crypto.randomUUID(), name, score: 0, members });
const validRoster = value => value && typeof value.text === 'string' && value.text.length <= 20000 && typeof value.classId === 'string';
const validTeams = value => Array.isArray(value) && value.length >= 1 && value.length <= 10 && new Set(value.map(t => t?.id)).size === value.length && value.every(team => team && typeof team.id === 'string' && typeof team.name === 'string' && team.name.length <= 80 && Number.isInteger(team.score) && Math.abs(team.score) <= 999 && Array.isArray(team.members) && team.members.every(m => typeof m === 'string'));

function RosterInput({ roster, setRoster, names }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api('/api/classes', { signal: controller.signal }).then(data => {
      setClasses(data);
      setRoster(current => !current.classId || data.some(cls => String(cls.id) === current.classId) ? current : { ...current, classId: '' });
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, setRoster]);
  return <section className="tool-roster tools-panel" aria-label="Danh sách dùng cho công cụ">
    <div className="tool-section-heading"><div><h2>Danh sách học sinh</h2><p className="text-muted">Chọn lớp rồi lấy danh sách, hoặc nhập tên bên dưới. Dùng chung cho bốc thăm và chia nhóm.</p></div><span className="tool-count">{names.length} tên</span></div>
    <div className="roster-source"><label>Lớp học<select className="form-input" value={roster.classId} disabled={loading || fetching} onChange={e => setRoster(r => ({ ...r, classId: e.target.value }))}>
      <option value="">{loading ? 'Đang tải danh sách lớp...' : 'Chọn lớp để lấy học sinh'}</option>{classes.map(cls => <option key={cls.id} value={String(cls.id)}>{cls.name}</option>)}
    </select></label><Button variant="secondary" disabled={!roster.classId || loading || fetching} onClick={async () => {
      setFetching(true); setError('');
      try { const students = await api(`/api/classes/${roster.classId}/students`); setRoster(r => ({ ...r, text: students.map(s => `${s.name} (#${s.id})`).join('\n') })); }
      catch (e) { setError(e.message); } finally { setFetching(false); }
    }}>{fetching ? 'Đang lấy học sinh...' : 'Lấy danh sách lớp'}</Button></div>
    {error && <div className="tool-error" role="alert">{error} Bạn vẫn có thể nhập tên thủ công. <button className="tool-retry" disabled={loading || fetching} onClick={() => setReload(value => value + 1)}>Tải lại danh sách lớp</button></div>}
    <label className="tool-roster-label">Mỗi học sinh một dòng<textarea rows="6" maxLength="20000" className="form-input" placeholder="Nhập hoặc dán danh sách học sinh..." value={roster.text} disabled={fetching} onChange={e => setRoster(r => ({ ...r, text: e.target.value }))} /></label>
    <div className="roster-footer"><p className="text-muted">Dòng trống và tên nhập trùng được bỏ qua. Danh sách từ lớp có mã HS để phân biệt người trùng tên.</p><Button variant="ghost" disabled={!roster.text || fetching} onClick={() => setRoster(r => ({ ...r, text: '' }))}>Xóa danh sách</Button></div>
  </section>;
}

function NamePicker({ names }) {
  const [noRepeat, setNoRepeat] = useState(true);
  const [used, setUsed] = useState([]);
  const [selected, setSelected] = useState('');
  useEffect(() => { setUsed([]); setSelected(''); }, [names]);
  const pool = noRepeat ? names.filter(name => !used.includes(name)) : names;
  return <section className="tools-panel name-picker" aria-label="Bốc thăm học sinh">
    <h2>Bốc thăm học sinh</h2><p className="text-muted">Chọn ngẫu nhiên một bạn để trả lời hoặc nhận nhiệm vụ.</p>
    <div className="picked-name" role="status" aria-live="polite">{selected || 'Tên được chọn sẽ hiện ở đây'}</div>
    <label className="tool-check"><input type="checkbox" checked={noRepeat} onChange={e => { setNoRepeat(e.target.checked); setUsed([]); setSelected(''); }} /> Không lặp lại trong cùng lượt</label>
    <p className="text-muted">{!names.length ? 'Nhập danh sách để bắt đầu.' : noRepeat ? `Còn ${pool.length}/${names.length} bạn chưa được gọi.` : `${names.length} bạn trong danh sách.`}</p>
    <div className="tool-actions"><Button disabled={!pool.length} onClick={() => { const name = pool[Math.floor(Math.random() * pool.length)]; setSelected(name); setUsed(items => [...items, name]); }}>Bốc thăm</Button><Button variant="secondary" disabled={!used.length} onClick={() => { setUsed([]); setSelected(''); }}>Bắt đầu lượt mới</Button></div>
    {names.length > 0 && !pool.length && <p role="status" className="tool-note">Đã gọi hết danh sách. Nhấn “Bắt đầu lượt mới” để tiếp tục.</p>}
    {used.length > 0 && <details className="picker-history"><summary>Đã gọi {used.length} lượt</summary><ol>{used.slice(-20).map((name, index) => <li key={`${index}-${name}`}>{name}</li>)}</ol></details>}
  </section>;
}

function GroupMaker({ names, onUseTeams }) {
  const [count, setCount] = useState('2');
  const [groups, setGroups] = useState([]);
  const [message, setMessage] = useState('');
  useEffect(() => { setGroups([]); setMessage(''); }, [names]);
  const number = Number(count);
  const valid = Number.isInteger(number) && number > 0 && number <= Math.min(20, names.length);
  return <section className="tools-panel group-maker" aria-label="Chia nhóm ngẫu nhiên">
    <h2>Chia nhóm ngẫu nhiên</h2><p className="text-muted">Trộn danh sách và chia đều; số thành viên giữa các nhóm chênh tối đa một bạn.</p>
    <div className="group-settings"><label>Số nhóm<input className="form-input" type="number" min="1" max={Math.max(1, Math.min(20, names.length))} step="1" value={count} onChange={e => setCount(e.target.value)} /></label><Button disabled={!valid} onClick={() => { setGroups(makeGroups(names, number)); setMessage(''); }}>Chia nhóm</Button></div>
    {!names.length ? <p className="tool-note">Nhập danh sách học sinh để chia nhóm.</p> : !valid && <p className="tool-error">Số nhóm từ 1 đến {Math.min(20, names.length)}.</p>}
    {groups.length > 0 && <><div className="group-results">{groups.map((members, index) => <article className="group-result" key={index}><h3>Nhóm {index + 1} <span>{members.length} bạn</span></h3><ol>{members.map(name => <li key={name}>{name}</li>)}</ol></article>)}</div>
      <div className="tool-actions"><Button variant="secondary" onClick={async () => {
        try { await navigator.clipboard.writeText(groups.map((members, i) => `Nhóm ${i + 1}\n${members.join('\n')}`).join('\n\n')); setMessage('Đã sao chép kết quả chia nhóm.'); }
        catch { setMessage('Không sao chép được. Bạn có thể chọn và sao chép phần kết quả bên trên.'); }
      }}>Sao chép kết quả</Button><Button variant="secondary" disabled={groups.length > 10} onClick={() => onUseTeams(groups)}>Tạo bảng điểm mới từ nhóm</Button></div>
      {groups.length > 10 && <p className="text-muted">Bảng điểm hỗ trợ tối đa 10 đội.</p>}
    </>}
    {message && <p role="status" className="tool-note">{message}</p>}
  </section>;
}

function Scoreboard({ teams, setTeams }) {
  const update = (id, patch) => setTeams(items => items.map(team => team.id === id ? { ...team, ...patch } : team));
  return <section className="tools-panel scoreboard" aria-label="Bảng điểm thi đua">
    <div className="tool-section-heading"><div><h2>Bảng điểm thi đua</h2><p className="text-muted">Đổi tên đội, cộng hoặc trừ điểm trong hoạt động trên lớp.</p></div><div className="tool-actions"><Button variant="secondary" disabled={teams.length >= 10} onClick={() => setTeams(items => [...items, newTeam(`Đội ${items.length + 1}`)])}>Thêm đội</Button><Button variant="secondary" disabled={teams.every(team => team.score === 0)} onClick={() => setTeams(items => items.map(team => ({ ...team, score: 0 })))}>Đưa điểm về 0</Button></div></div>
    <div className="scoreboard-teams">{teams.map((team, index) => <article key={team.id} className="score-team">
      <label>Tên đội {index + 1}<input className="form-input" maxLength="80" value={team.name} onChange={e => update(team.id, { name: e.target.value })} /></label>
      <output className="team-score" aria-live="polite" aria-label={`Điểm ${team.name || `đội ${index + 1}`}`}>{team.score}</output>
      <div className="score-actions"><Button variant="secondary" aria-label={`Trừ 1 điểm ${team.name || `đội ${index + 1}`}`} disabled={team.score <= -999} onClick={() => update(team.id, { score: team.score - 1 })}>−1</Button><Button aria-label={`Cộng 1 điểm ${team.name || `đội ${index + 1}`}`} disabled={team.score >= 999} onClick={() => update(team.id, { score: team.score + 1 })}>+1</Button></div>
      {team.members.length > 0 && <details><summary>{team.members.length} thành viên</summary><ul>{team.members.map(name => <li key={name}>{name}</li>)}</ul></details>}
      <Button variant="ghost" disabled={teams.length === 1} onClick={() => setTeams(items => items.filter(item => item.id !== team.id))}>Bỏ đội</Button>
    </article>)}</div>
  </section>;
}

export function TeachingTools() {
  const [active, setActive] = useState('timer');
  const [params] = useSearchParams();
  const classId = params.get('class');
  const [savedRoster, setSavedRoster, rosterSaved] = useToolStorage('kidit-tools-roster-v1', () => ({ classId: '', text: '' }), validRoster);
  const [teams, setTeams, scoresSaved] = useToolStorage('kidit-tools-scores-v1', () => [newTeam('Đội 1'), newTeam('Đội 2')], validTeams);
  const [classLoad, setClassLoad] = useState(null);
  const [classRoster, setClassRoster] = useState({ classId: '', text: '' });
  const hasClass = /^\d+$/.test(classId || '');
  const roster = hasClass ? classRoster : savedRoster;
  const setRoster = hasClass ? setClassRoster : setSavedRoster;
  useEffect(() => {
    if (!hasClass) return;
    setClassRoster({ classId, text: '' });
    const controller = new AbortController();
    api(`/api/classes/${classId}/students`, { signal: controller.signal }).then(students => {
      if (controller.signal.aborted) return;
      setClassRoster({ classId, text: students.map(student => `${student.name} (#${student.id})`).join('\n') });
      setClassLoad({ classId, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setClassLoad({ classId, error: error.message });
    });
    return () => controller.abort();
  }, [classId, hasClass]);
  const loadingClass = hasClass && classLoad?.classId !== classId;
  const names = useMemo(() => parseNames(roster.text), [roster.text]);
  return <div className="teaching-tools"><div className="page-header"><h1 className="text-h1">Công cụ trên lớp</h1></div>
    <nav className="tools-navigation" aria-label="Chọn công cụ hỗ trợ">{TOOLS.map(([key, label]) => <button key={key} aria-pressed={active === key} onClick={() => setActive(key)}>{label}</button>)}</nav>
    {(!rosterSaved || !scoresSaved) && <p role="status" className="tool-error">Trình duyệt không lưu được dữ liệu công cụ. Bạn vẫn sử dụng được trong trang đang mở.</p>}
    <div hidden={active !== 'timer'} className="tools-panel"><CountdownTimer /></div>
    {(active === 'picker' || active === 'groups') && loadingClass && <p role="status">Đang lấy danh sách lớp…</p>}
    {(active === 'picker' || active === 'groups') && !loadingClass && <>
      {classLoad?.classId === classId && classLoad?.error && <p role="alert" className="tool-error">Không lấy được danh sách lớp: {classLoad.error}. Hãy chọn lại lớp bên dưới.</p>}
      <RosterInput roster={roster} setRoster={setRoster} names={names} />
    </>}
    <div hidden={active !== 'picker' || loadingClass}><NamePicker names={names} /></div>
    <div hidden={active !== 'groups' || loadingClass}><GroupMaker names={names} onUseTeams={groups => { setTeams(groups.map((members, i) => newTeam(`Nhóm ${i + 1}`, members))); setActive('scores'); }} /></div>
    <div hidden={active !== 'scores'}><Scoreboard teams={teams} setTeams={setTeams} /></div>
    {active === 'quiz' && <QuizHost />}
  </div>;
}

export function TimerPopupPage() {
  useEffect(() => { const previous = document.title; document.title = 'Đếm ngược | KidIT Manager'; return () => { document.title = previous; }; }, []);
  return <main className="timer-popup-page"><p className="timer-popup-brand">KidIT Manager · Công cụ giảng dạy</p><CountdownTimer popup /></main>;
}
