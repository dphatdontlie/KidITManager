import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { WEEKDAYS } from '../../shared/class-schedule';
import { localDate } from '../lib/api';
import { dateLabel } from './format';
import { lessonHref, SCHEDULE_DAYS, shiftScheduleDate, TIME_SLOTS } from './schedule';
import { Button } from './ui';
import CompactSchedule from './CompactSchedule';
import './weekly-schedule.css';

const shortDate = date => `${Number(date.slice(8))}/${Number(date.slice(5, 7))}`;

function WeeklyEntry({ entry, showTime, roomLabel }) {
  return <Link className={showTime ? 'schedule-event' : 'timetable-class'} to={lessonHref(entry.classId, entry.date, entry.timeKey)}>
    {showTime && <span className="event-time">{entry.timeKey.replace('-', '–')}</span>}
    <strong>{entry.className}</strong>
    <span>GV: {entry.teacher}</span>
    <small>TG: {entry.ta || 'Chưa phân công'}</small>
    <small>{roomLabel(entry.room)}</small>
  </Link>;
}

export default function WeeklySchedule({ blocks, visible, week, weekStart, onWeekChange, view, onViewChange, roomLabel }) {
  const today = localDate();
  const weekEnd = shiftScheduleDate(weekStart, 6);
  const previous = shiftScheduleDate(week, -7);
  const next = shiftScheduleDate(week, 7);
  const years = weekStart.slice(0, 4) === weekEnd.slice(0, 4) ? weekStart.slice(0, 4) : `${weekStart.slice(0, 4)}–${weekEnd.slice(0, 4)}`;
  const times = [...new Set([...TIME_SLOTS, ...blocks.map(entry => entry.timeKey)])].sort();
  const days = SCHEDULE_DAYS.map((day, i) => ({
    day, date: shiftScheduleDate(weekStart, i),
    entries: visible.filter(entry => entry.dayIndex === day).sort((a, b) => a.timeKey.localeCompare(b.timeKey)),
  }));
  return <section className="weekly-schedule" aria-labelledby="weekly-schedule-title">
    <header className="schedule-panel-heading weekly-schedule-heading">
      <div aria-live="polite" aria-atomic="true">
        <h2 id="weekly-schedule-title">Tuần {shortDate(weekStart)}–{shortDate(weekEnd)} <span>{years}</span></h2>
        <p>{visible.length} suất theo bộ lọc</p>
      </div>
      <div className="weekly-navigation">
        <Button variant="secondary" icon={ChevronLeft} disabled={!previous} onClick={() => onWeekChange(previous)}>Tuần trước</Button>
        <Button variant="ghost" onClick={() => onWeekChange(today)}>Tuần này</Button>
        <Button variant="secondary" className="weekly-next" icon={ChevronRight} disabled={!next} onClick={() => onWeekChange(next)}>Tuần sau</Button>
      </div>
    </header>
    <div className="weekly-view-bar">
      <div className="segmented" role="group" aria-label="Cách xem lịch tuần">
        <button type="button" aria-pressed={view === 'grid'} className={view === 'grid' ? 'selected' : ''} onClick={() => onViewChange('grid')}>Thời khóa biểu</button>
        <button type="button" aria-pressed={view === 'list'} className={view === 'list' ? 'selected' : ''} onClick={() => onViewChange('list')}>Danh sách</button>
      </div>
    </div>
    {view === 'grid' ? <>
      <CompactSchedule days={days} today={today}/>
      <div className="desktop-week-grid">
        <div className="timetable-scroll" role="region" aria-label="Thời khóa biểu theo thứ và suất" tabIndex={0}>
          <table className="legacy-timetable">
            <caption className="sr-only">Thời khóa biểu tuần {dateLabel(weekStart)} đến {dateLabel(weekEnd)}</caption>
            <thead><tr><th scope="col">Giờ / Ngày</th>{days.map(({ day, date }) => <th scope="col" key={day} aria-current={date === today ? 'date' : undefined}>
              {WEEKDAYS[day]} <span>{shortDate(date)}</span>
            </th>)}</tr></thead>
            <tbody>{times.map(time => <tr key={time}>
              <th scope="row">{time.replace('-', ' – ')}</th>
              {days.map(({ day, entries }) => <td key={day}>{entries.filter(entry => entry.timeKey === time).map(entry =>
                <WeeklyEntry key={entry.id} entry={entry} roomLabel={roomLabel}/>
              )}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </> : <div className="weekly-slot-list">
      {days.map(({ day, date, entries }) => <section className="panel" key={day} aria-current={date === today ? 'date' : undefined}>
        <h3>{WEEKDAYS[day]} <span>{shortDate(date)}</span></h3>
        <div className="weekly-day-classes">
          {entries.length ? entries.map(entry => <WeeklyEntry key={entry.id} entry={entry} showTime roomLabel={roomLabel}/>) : <p className="no-event">Không có lớp</p>}
        </div>
      </section>)}
    </div>}
  </section>;
}
