import { Link } from 'react-router-dom';
import { lessonHref } from './schedule';
import { WEEKDAYS } from '../../shared/class-schedule';
import { dateLabel } from './format';
import './compact-schedule.css';

export default function CompactSchedule({ days, today }) {
  return <section className="compact-week" aria-label="Thời khóa biểu tuần gọn">
    {days.map(({ day, date, entries }) => {
      const times = [...new Set(entries.map(b => b.timeKey))].sort();
      return <section className={`compact-day ${date === today ? 'today' : ''}`} key={day} aria-label={`${WEEKDAYS[day]}, ${dateLabel(date)}`}>
        <header><h3>{day === 0 ? 'CN' : `T${day + 1}`}</h3><span>{Number(date.slice(8))}/{Number(date.slice(5, 7))}</span></header>
        <div className="compact-day-slots">{times.length ? times.map(time => <div className="compact-slot" key={time}>
          <div className="compact-slot-time" aria-label={`Từ ${time.replace('-', ' đến ')}`}><strong>{time.split('-')[0]}</strong><span>{time.split('-')[1]}</span></div>
          <div className="compact-slot-classes">{entries.filter(b => b.timeKey === time).map(b => <Link key={b.id} to={lessonHref(b.classId,b.date,b.timeKey)} aria-label={`${b.className}, ${WEEKDAYS[day]}, ${time.replace('-', ' đến ')}. Mở lớp`}>{b.className}</Link>)}</div>
        </div>) : <p className="compact-day-empty">Không có lớp</p>}</div>
      </section>;
    })}
  </section>;
}
