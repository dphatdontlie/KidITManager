import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCenter } from './center-context';
import { ClassNotes } from './ClassNotes';
import { Button, Empty, Feedback, PageHead, PanelHead } from './ui';
import { dateLabel, money } from './format';
import { localDate } from '../lib/api';
import { summarizePay } from '../../shared/payroll';
import { classSlots } from './schedule';
import './management.css';

export default function AdminDashboard() {
  const d = useCenter(); const [noteData, setNotes] = useState({ rows: [], loading: true, month: '' });
  const notesReady = noteData.month === d.month && !noteData.loading && !noteData.error;
  const notes = noteData.month === d.month ? noteData.rows : [];
  const completed = d.work.filter(row => row.status === 'completed');
  const salary = summarizePay(completed);
  const draft = d.work.filter(row => row.status === 'draft');
  const people = d.teachers.map(teacher => {
    const rows = completed.filter(row => row.teacherId === teacher.id);
    return { ...teacher, count: rows.length, ...summarizePay(rows) };
  }).filter(row => row.count).sort((a, b) => b.amount - a.amount);
  const today = localDate();
  const lessons = d.classes.flatMap(cls => classSlots(cls, today).map(slot => ({ ...slot, cls }))).sort((a, b) => a.start.localeCompare(b.start));
  const expense = notes.filter(note => note.category === 'expense').reduce((sum, note) => sum + (note.amount || 0), 0);
  return <div className="admin-dashboard"><PageHead title="Bàn điều hành KidIT" description="Theo dõi buổi học, tiền lương và những ghi chú cần xử lý trong một chỗ."><Button variant="secondary" onClick={() => { d.refreshCore(); d.refreshWork(); d.resourceCache.current.clear(); d.notesChanged(); }}>Cập nhật dữ liệu</Button><Button onClick={() => d.addWork()}>Chấm công cho giáo viên</Button></PageHead>
    <div className="management-period"><label>Tháng quản lý<input aria-label="Tháng quản lý" type="month" value={d.month} onChange={e => e.target.value && d.setMonth(e.target.value)}/></label><p>Chuyển tab vẫn giữ dữ liệu. Cập nhật khi bạn cần đối chiếu thông tin mới.</p><Link className="text-link" to="/payroll">Mở bảng công chi tiết</Link></div>
    <Feedback error={d.workError} retry={d.refreshWork}/>
    <section className="management-numbers" aria-label="Tổng quan tháng"><div className="management-salary"><span>Lương đã xác nhận · {d.month}</span><strong>{d.workLoading || d.workError ? 'Đang chờ dữ liệu' : money(salary.amount)}</strong><p>{completed.length} công đã xác nhận{salary.missing > 0 && ` · ${salary.missing} công chưa đủ đội hình để cộng tiền`}</p></div><div><span>Công cần xác nhận</span><strong>{d.workLoading || d.workError ? '…' : draft.length}</strong><Link to="/payroll">Kiểm tra bảng công</Link></div><div><span>Ghi chú cần theo dõi</span><strong>{notesReady ? notes.filter(note => note.status === 'open').length : '…'}</strong><a href="#management-notes">Mở sổ ghi chú</a></div><div><span>Chi phí đã ghi chú</span><strong className="management-cost">{notesReady ? money(expense) : '…'}</strong><p>Theo nội dung giáo viên nhập</p></div></section>
    <div className="management-columns"><section className="panel"><PanelHead title="Lương theo nhân sự" caption="Chỉ cộng công đã xác nhận và có đủ đội hình."/>{d.workLoading && <p className="inset" role="status">Đang cập nhật bảng lương...</p>}<div className="management-pay-list">{people.map(person => <div key={person.id}><span><strong>{person.name}</strong><small>{person.count} công{person.missing > 0 && ` · ${person.missing} công thiếu đội hình`}</small></span><b>{money(person.amount)}</b></div>)}</div>{!d.workLoading && !people.length && <Empty title="Chưa có lương được ghi nhận" text="Ghi công cho buổi đã dạy hoặc chọn tháng khác."/>}<Link className="management-panel-link" to="/payroll">Xem công đã xác nhận, dự kiến và xuất bảng lương</Link></section>
      <section className="panel"><PanelHead title={`Lớp hôm nay · ${dateLabel(today)}`} caption={`${lessons.length} suất theo lịch có hiệu lực hôm nay`}/><div className="management-agenda">{lessons.map(({ cls, start, end, teacher, ta }) => <Link to={`/classes/${cls.id}`} key={`${cls.id}-${start}`}><time>{start}<small>{end}</small></time><span><strong>{cls.name}</strong><small>GV: {teacher || 'Chưa phân công'}{ta && ` · TG: ${ta}`}</small></span><span>Mở lớp</span></Link>)}</div>{!lessons.length && <Empty title="Hôm nay không có lớp theo lịch" text="Mở thời khóa biểu để xem các ngày khác."/>}<Link className="management-panel-link" to="/schedule">Xem toàn bộ thời khóa biểu</Link></section></div>
    <div id="management-notes"><ClassNotes overview onLoaded={setNotes}/></div>
  </div>;
}
