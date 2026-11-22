import { Link } from 'react-router-dom';
import { lessonHref, SCHEDULE_DAYS } from './schedule';
import { WEEKDAYS } from '../../shared/class-schedule';
import './compact-schedule.css';

export default function CompactSchedule({ blocks }) {
  const today = new Date().getDay();
  return <section className="compact-week" aria-label="Thời khóa biểu tuần gọn">
    <div className="compact-week-heading"><h2>Lịch trong tuần</h2><span>Chạm tên lớp để mở lớp</span></div>
    {SCHEDULE_DAYS.map(day => {
      const entries = blocks.filter(b => b.dayIndex === day);
      const times = [...new Set(entries.map(b => b.timeKey))].sort();
      return <section className={`compact-day ${day === today ? 'today' : ''}`} key={day} aria-label={WEEKDAYS[day]}>
        <header><h3>{day === 0 ? 'CN' : `T${day + 1}`}</h3>{day === today && <span>Hôm nay</span>}</header>
        <div className="compact-day-slots">{times.length ? times.map(time => <div className="compact-slot" key={time}>
          <div className="compact-slot-time" aria-label={`Từ ${time.replace('-', ' đến ')}`}><strong>{time.split('-')[0]}</strong><span>{time.split('-')[1]}</span></div>
          <div className="compact-slot-classes">{entries.filter(b => b.timeKey === time).map(b => <Link key={b.id} to={lessonHref(b.classId,b.date,b.timeKey)} aria-label={`${b.className}, ${WEEKDAYS[day]}, ${time.replace('-', ' đến ')}. Mở lớp`}>{b.className}</Link>)}</div>
        </div>) : <p className="compact-day-empty">Không có lớp</p>}</div>
      </section>;
    })}
  </section>;
}
