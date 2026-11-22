import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { WEEKDAYS } from '../../shared/class-schedule';
import { scheduleOnDate } from '../../shared/schedule-history';
import { localDate } from '../lib/api';
import { useCenter } from './center-context';
import { classSlots, lessonHref, SCHEDULE_DAYS, slotHasPerson } from './schedule';
import { dateLabel } from './format';
import { Badge, Button, Empty, Feedback, Find, PageHead, PanelHead, Select } from './ui';
import AdminDashboard from './AdminDashboard';

const roomLabel = room => room ? (/^phòng\b/iu.test(room) ? room : `Phòng ${room}`) : 'Chưa xếp phòng';
const localClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function Scope({ mine, onChange, noun }) {
  return <div className="page-tabs teaching-scope" aria-label={`Phạm vi ${noun.toLowerCase()}`}>
    <button type="button" aria-pressed={mine} className={mine ? 'active' : ''} onClick={() => onChange(true)}>{noun} của tôi</button>
    <button type="button" aria-pressed={!mine} className={!mine ? 'active' : ''} onClick={() => onChange(false)}>Toàn trung tâm</button>
  </div>;
}

export function Dashboard() {
  const d = useCenter();
  const [mine, setMine] = useState(true);
  const [selectedDate, setDate] = useState('');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  if (d.role === 'admin') return <AdminDashboard/>;

  const today = localDate();
  const date = selectedDate || today;
  const clock = localClock.format(now);
  const lessons = d.classes.flatMap(cls => classSlots(cls, date)
    .filter(slot => !mine || slotHasPerson(slot, d.user.name))
    .map(slot => ({ cls: scheduleOnDate(cls, date), slot })));
  const priority = slot => date !== today ? 0 : clock >= slot.end ? 2 : clock >= slot.start ? 0 : 1;
  lessons.sort((a, b) => priority(a.slot) - priority(b.slot) || a.slot.start.localeCompare(b.slot.start));
  const drafts = d.work.filter(work => work.teacherId === d.user.id && work.status === 'draft');

  return <>
    <PageHead title={date === today ? 'Hôm nay' : 'Lịch trong ngày'} description={dateLabel(date)}>
      <label className="inline-date">Ngày<input type="date" value={date} onChange={e => setDate(e.target.value === today ? '' : e.target.value)}/></label>
    </PageHead>
    <Scope mine={mine} onChange={setMine} noun="Lịch"/>
    <div className="teaching-columns">
      <section className="panel agenda">
        <PanelHead title={`${lessons.length} buổi theo lịch`}><Link className="text-link" to="/schedule">Lịch cả tuần</Link></PanelHead>
        {lessons.map(({ cls, slot }) => {
          const active = date === today && priority(slot) === 0;
          const status = date < today || date === today && priority(slot) === 2 ? 'Đã qua giờ' : active ? 'Đang dạy' : 'Sắp tới';
          const href = lessonHref(cls.id, date, slot.key);
          return <article className={`agenda-row teaching-lesson ${active ? 'teaching-lesson-active' : ''}`} key={href}>
            <div className="agenda-time"><strong>{slot.start}–{slot.end}</strong><span>{status}</span></div>
            <div className="agenda-content"><h3><Link to={href}>{cls.name}</Link></h3>
              <p className="muted">{roomLabel(cls.room)} · {d.roster(cls.id).length} học sinh</p>
              {!mine && <p className="muted">{slot.teacher || 'Chưa phân công giáo viên'}{slot.ta && ` · TG: ${slot.ta}`}</p>}
            </div>
            <Link className={`button ${active ? '' : 'secondary'}`} to={href}>{active ? 'Vào điểm danh' : 'Xem buổi'}</Link>
          </article>;
        })}
        {!lessons.length && <Empty title={mine ? 'Bạn không có buổi dạy ngày này' : 'Không có buổi theo lịch'} text="Chọn ngày khác hoặc xem lịch tuần."/>}
      </section>
      <aside className="panel teaching-tasks">
        <PanelHead title="Việc cần làm" caption={`Tháng ${d.month.slice(5)}/${d.month.slice(0, 4)}`}/>
        <Feedback error={d.workError} retry={d.refreshWork}/>
        {d.workLoading && <p className="inset" role="status">Đang tải công…</p>}
        {!d.workLoading && !d.workError && (drafts.length ? drafts.slice(0, 3).map(work => <article key={work.entryId}>
          <Badge value={work.status}/>
          <h3>{d.cls(work.classId)?.name || work.class_name}</h3>
          <p className="muted">{dateLabel(work.date)} · {work.start}–{work.end}</p>
          <Button variant="secondary" onClick={() => d.addWork(work.classId, work.date, work)}>Mở bản nháp</Button>
        </article>) : <p className="inset muted">Không có công nháp trong tháng này.</p>)}
        <div className="panel-foot"><Link className="text-link" to="/payroll">Xem công của tôi</Link></div>
      </aside>
    </div>
  </>;
}

export function Classes() {
  const d = useCenter();
  const [mine, setMine] = useState(d.role !== 'admin');
  const [query, setQuery] = useState('');
  const [day, setDay] = useState('');
  const [room, setRoom] = useState('');
  const today = localDate();
  const classes = d.classes.map(cls => ({
    cls: scheduleOnDate(cls, today),
    slots: classSlots(cls).sort((a, b) => SCHEDULE_DAYS.indexOf(a.day) - SCHEDULE_DAYS.indexOf(b.day) || a.start.localeCompare(b.start)),
  }));
  const rooms = [...new Set(classes.map(({ cls }) => cls.room).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  const search = query.trim().toLocaleLowerCase('vi');
  const rows = classes.filter(({ cls, slots }) => {
    const staff = slots.flatMap(slot => slot.staff.map(person => person.name));
    return (!mine || slots.some(slot => slotHasPerson(slot, d.user.name)))
      && [cls.name, ...staff].join(' ').toLocaleLowerCase('vi').includes(search)
      && (!day || slots.some(slot => slot.day === Number(day)))
      && (!room || cls.room === room);
  });
  return <>
    <PageHead title="Lớp học"><Button icon={Plus} onClick={() => d.classEditor()}>Tạo lớp học</Button></PageHead>
    {!!d.user.id && <Scope mine={mine} onChange={setMine} noun="Lớp"/>}
    <div className="filters">
      <Find value={query} onChange={setQuery} placeholder="Tìm lớp, giáo viên hoặc trợ giảng"/>
      <Select label="Ngày học" value={day} onChange={e => setDay(e.target.value)}>
        <option value="">Tất cả ngày</option>{SCHEDULE_DAYS.map(i => <option key={i} value={i}>{WEEKDAYS[i]}</option>)}
      </Select>
      <Select label="Phòng" value={room} onChange={e => setRoom(e.target.value)}>
        <option value="">Tất cả phòng</option>{rooms.map(name => <option key={name} value={name}>{roomLabel(name)}</option>)}
      </Select>
      <span className="result-count">{rows.length} lớp</span>
    </div>
    <div className="class-grid teaching-class-grid">{rows.map(({ cls, slots }) => {
      const count = d.roster(cls.id).length;
      const remaining = cls.capacity - count;
      const capacity = !cls.capacity ? 'Không giới hạn' : remaining === 0 ? 'Đủ lớp' : remaining > 0 ? `Còn ${remaining} chỗ` : `Vượt ${-remaining} chỗ`;
      return <article className="class-card teaching-class" key={cls.id}>
        <header className="class-card-top"><h2>{cls.name}</h2><span className="room">{roomLabel(cls.room)}</span></header>
        <p className="teaching-class-count">{cls.capacity ? `${count} / ${cls.capacity}` : count} học sinh <small>{capacity}</small></p>
        <ul className="teaching-slot-list">{slots.map(slot => <li key={slot.label}>
          <div><strong>{WEEKDAYS[slot.day]}</strong><time>{slot.start}–{slot.end}</time></div>
          <p><span>Giáo viên</span> {slot.teacher || 'Chưa phân công'}</p>
          <p><span>Trợ giảng</span> {slot.ta || 'Chưa phân công'}</p>
        </li>)}</ul>
        {!slots.length && <p className="muted">Chưa xếp lịch</p>}
        <footer><Link className="button secondary" aria-label={`Mở lớp ${cls.name}`} to={`/classes/${cls.id}`}>Mở lớp</Link></footer>
      </article>;
    })}</div>
    {!rows.length && <Empty title="Không tìm thấy lớp phù hợp" text="Thử đổi phạm vi hoặc bộ lọc."/>}
  </>;
}
