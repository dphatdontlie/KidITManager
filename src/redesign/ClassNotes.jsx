import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, jsonBody, localDate } from '../lib/api';
import { useCenter } from './center-context';
import { Button, Empty, Feedback, Find, PanelHead, Select } from './ui';
import { dateLabel, money } from './format';
import './management.css';

const categories = { teaching: 'Giảng dạy', expense: 'Chi tiêu', other: 'Ghi chú khác' };

function useClassNotes(classId, month) {
  const d = useCenter();
  const key = `notes:${classId || 'all'}:${month}`;
  const cached = d.resourceCache.current.get(key);
  const [state, setState] = useState({ key, rows: cached || [], loading: !cached, error: '' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const saved = d.resourceCache.current.get(key);
    if (saved && !reload) { setState({ key, rows: saved, loading: false, error: '' }); return; }
    const controller = new AbortController();
    setState(current => ({ key, rows: current.key === key ? current.rows : [], loading: true, error: '' }));
    api(`/api/class-notes?month=${month}${classId ? `&class_id=${classId}` : ''}`, { signal: controller.signal }).then(rows => {
      if (controller.signal.aborted) return;
      d.resourceCache.current.set(key, rows); setState({ key, rows, loading: false, error: '' });
    }).catch(error => { if (!controller.signal.aborted) setState(current => ({ ...current, loading: false, error: error.message })); });
    return () => controller.abort();
  }, [key, classId, month, reload, d.resourceCache, d.notesVersion]);
  const refresh = useCallback(() => setReload(n => n + 1), []);
  return { ...(state.key === key ? state : { rows: [], loading: true, error: '' }), refresh };
}

export function ClassNotes({ classId, selectedDate, overview = false, onLoaded }) {
  const d = useCenter();
  const [month, setMonth] = useState(selectedDate?.slice(0, 7) || d.month);
  const data = useClassNotes(classId, overview ? d.month : month);
  const [query, setQuery] = useState(''); const [category, setCategory] = useState(''); const [status, setStatus] = useState(''); const [filterClass, setFilterClass] = useState('');
  useEffect(() => { onLoaded?.({ rows: data.rows, loading: data.loading, error: data.error, month: overview ? d.month : month }); }, [data.rows, data.loading, data.error, onLoaded, overview, d.month, month]);
  const rows = data.rows.filter(row => (!category || row.category === category) && (!status || row.status === status) && (!filterClass || row.class_id === Number(filterClass)) && `${row.content} ${row.author_name} ${row.class_name}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  const edit = note => d.open({ title: note ? 'Sửa ghi chú buổi học' : 'Ghi chú buổi học', wide: true, initial: note || { class_id: classId || '', date: selectedDate || localDate(), category: 'teaching', content: '', amount: '', status: 'open' }, fields: values => [
    ...(!classId ? [{ key: 'class_id', label: 'Lớp học', type: 'select', full: true, required: true, options: [{ value: '', label: 'Chọn lớp' }, ...d.classes.filter(c => !note || c.id === note.class_id).map(c => ({ value: c.id, label: c.name }))] }] : []),
    { key: 'date', label: 'Ngày ghi chú', type: 'effective-date', required: true, full: true, help: 'Ghi chú gắn với lớp và ngày, có thể dùng cho cả việc chuẩn bị hoặc sau buổi học.' },
    { key: 'category', label: 'Loại ghi chú', type: 'select', options: Object.entries(categories).map(([value, label]) => ({ value, label })) },
    { key: 'status', label: 'Theo dõi', type: 'select', options: [{ value: 'open', label: 'Cần theo dõi' }, { value: 'done', label: 'Đã xử lý' }] },
    ...(values.category === 'expense' ? [{ key: 'amount', label: 'Số tiền (đ, không bắt buộc)', type: 'number', min: 0, help: 'Chỉ để theo dõi chi phí; không tự trừ học phí hoặc lương.' }] : []),
    { key: 'content', label: 'Nội dung ghi chú', type: 'textarea', required: true, maxLength: 10000, full: true },
  ], save: async values => {
    await api(`/api/class-notes${note ? `/${note.id}` : ''}`, jsonBody({ ...values, class_id: Number(values.class_id), version: note?.version }, note ? 'PUT' : 'POST'));
    d.resourceCache.current.clear(); d.notesChanged();
    if (!overview) setMonth(values.date.slice(0, 7)); else d.setMonth(values.date.slice(0, 7));
    data.refresh(); d.notify('Đã lưu ghi chú buổi học.');
  } });
  const expense = data.rows.filter(row => row.category === 'expense').reduce((sum, row) => sum + (row.amount || 0), 0);
  return <section className="panel class-notes"><PanelHead title={overview ? 'Sổ ghi chú toàn trung tâm' : 'Ghi chú của lớp'} caption="Giảng dạy, chi tiêu và việc cần theo dõi; lưu theo ngày và người viết."><Button onClick={() => edit()}>Thêm ghi chú</Button></PanelHead>
    <div className="notes-toolbar">{!overview && <label>Tháng ghi chú<input aria-label="Tháng ghi chú" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)}/></label>}<Find value={query} onChange={setQuery} placeholder="Tìm nội dung, người viết hoặc lớp..."/><Select label="Loại" value={category} onChange={e => setCategory(e.target.value)}><option value="">Tất cả loại</option>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select label="Theo dõi" value={status} onChange={e => setStatus(e.target.value)}><option value="">Tất cả</option><option value="open">Cần theo dõi</option><option value="done">Đã xử lý</option></Select>{overview && <Select label="Lớp" value={filterClass} onChange={e => setFilterClass(e.target.value)}><option value="">Tất cả lớp</option>{d.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}<Button variant="ghost small" onClick={data.refresh}>Cập nhật</Button></div>
    <Feedback error={data.error} retry={data.refresh}/>{data.loading && <p className="inset" role="status">Đang cập nhật ghi chú...</p>}
    {!data.error && <><div className="notes-totals"><span>{data.rows.filter(row => row.status === 'open').length} ghi chú cần theo dõi</span><span>Chi phí đã ghi chú trong tháng: <strong>{money(expense)}</strong></span></div><div className="note-list">{rows.map(note => <article className="note-item" key={note.id}><div className="note-heading"><span>{categories[note.category]} · {dateLabel(note.date)}{overview && <> · <Link to={`/classes/${note.class_id}`}>{note.class_name}</Link></>}</span><span className={`note-state ${note.status}`}>{note.status === 'open' ? 'Cần theo dõi' : 'Đã xử lý'}</span></div><p className="note-content">{note.content}</p>{note.amount != null && <strong>{money(note.amount)}</strong>}<footer><span>{note.author_name}{note.updated_by !== note.author_name && ` · Sửa bởi ${note.updated_by}`}</span>{(d.role === 'admin' || note.author_account_id === d.user.accountId) && <Button variant="ghost small" onClick={() => edit(note)}>Sửa / cập nhật</Button>}</footer></article>)}</div>{!data.loading && !rows.length && <Empty title="Chưa có ghi chú phù hợp" text="Thêm ghi chú sau buổi học hoặc đổi bộ lọc để xem những ghi chú đã lưu."/>}</>}
  </section>;
}
