import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { weekdayLabel } from '../../shared/class-schedule';
import { localDate } from '../lib/api';
import { dateLabel } from './format';
import { buildMonthSchedule, lessonHref, shiftScheduleMonth } from './schedule';
import { Button, Empty, Icon } from './ui';
import './monthly-schedule.css';

const weekdays = [
  ['T2', 'Thứ Hai'], ['T3', 'Thứ Ba'], ['T4', 'Thứ Tư'], ['T5', 'Thứ Năm'],
  ['T6', 'Thứ Sáu'], ['T7', 'Thứ Bảy'], ['CN', 'Chủ nhật'],
];

function MonthDay({ day, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); opener?.focus(); };
  }, []);
  return <dialog className="dialog month-day-dialog" ref={ref} aria-labelledby="month-day-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="dialog-head">
      <div><p className="muted">{day.blocks.length} suất theo bộ lọc</p><h2 id="month-day-title">{weekdayLabel(day.date)}, {dateLabel(day.date)}</h2></div>
      <button className="icon-button" type="button" aria-label="Đóng lịch trong ngày" onClick={onClose}><Icon icon={X}/></button>
    </header>
    {day.blocks.length ? <ul className="month-day-lessons">{day.blocks.map(entry => <li key={entry.id}>
      <Link to={lessonHref(entry.classId, day.date, entry.timeKey)}>
        <time>{entry.timeKey.replace('-', '–')}</time>
        <strong>{entry.className}</strong>
        {entry.room && <span>{/^phòng\b/iu.test(entry.room) ? entry.room : `Phòng ${entry.room}`}</span>}
        <small>{entry.teacher}{entry.ta && ` · TG: ${entry.ta}`}</small>
        <Icon icon={ChevronRight} size={17}/>
      </Link>
    </li>)}</ul> : <Empty title="Không có suất theo bộ lọc" text="Chọn ngày khác hoặc đổi phạm vi lịch."/>}
  </dialog>;
}

export default function MonthlySchedule({ month, onMonthChange, classes, person, includes }) {
  const [selected, setSelected] = useState(null);
  const today = localDate();
  const current = today.slice(0, 7);
  const previous = shiftScheduleMonth(month, -1);
  const next = shiftScheduleMonth(month, 1);
  const calendar = buildMonthSchedule(classes, person, month, includes);
  const count = calendar.reduce((sum, day) => sum + day.blocks.length, 0);
  const [year, monthNumber] = month.split('-');
  const heading = `Tháng ${Number(monthNumber)}`;
  const years = Array.from({ length: 11 }, (_, index) => Number(year) - 5 + index).filter(item => item >= 1000 && item <= 9999);
  const selectedDay = calendar.find(day => day.date === selected);
  const changeMonth = value => {
    if (!shiftScheduleMonth(value, 0)) return;
    setSelected(null);
    onMonthChange(value);
  };

  return <section className="monthly-schedule" aria-labelledby="monthly-schedule-title">
    <div className="month-heading">
      <div className="month-heading-info">
        <div aria-live="polite" aria-atomic="true">
          <h2 id="monthly-schedule-title">{heading} <span>{year}</span></h2>
          <p>{count} suất theo bộ lọc</p>
        </div>
        <Button variant="ghost" disabled={month === current} onClick={() => changeMonth(current)}>Tháng này</Button>
      </div>
      <div className="month-nav">
        <Button variant="secondary month-arrow" icon={ChevronLeft} aria-label="Tháng trước" disabled={!previous} onClick={() => changeMonth(previous)}/>
        <label className="sr-only" htmlFor="teaching-month">Chọn tháng</label>
        <select id="teaching-month" value={monthNumber} onChange={event => changeMonth(`${year}-${event.target.value}`)}>
          {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>Tháng {i + 1}</option>)}
        </select>
        <label className="sr-only" htmlFor="teaching-year">Chọn năm</label>
        <select id="teaching-year" value={year} onChange={event => changeMonth(`${event.target.value}-${monthNumber}`)}>
          {years.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <Button variant="secondary month-arrow" icon={ChevronRight} aria-label="Tháng sau" disabled={!next} onClick={() => changeMonth(next)}/>
      </div>
    </div>
    <table className="month-calendar">
      <caption className="sr-only">{heading} năm {month.slice(0, 4)}</caption>
      <thead><tr>{weekdays.map(([short, full]) => <th key={short} scope="col"><abbr title={full}>{short}</abbr></th>)}</tr></thead>
      <tbody>{Array.from({ length: calendar.length / 7 }, (_, week) => <tr key={week}>
        {calendar.slice(week * 7, week * 7 + 7).map((day, i) => <td key={day.date || i} className={!day.inMonth ? 'month-outside' : undefined}>
          {day.inMonth ? <button type="button" className="month-day" aria-current={today === day.date ? 'date' : undefined}
            aria-label={`${weekdayLabel(day.date)}, ${dateLabel(day.date)}, ${day.blocks.length} suất`} onClick={() => setSelected(day.date)}>
            <span className="month-date-number">{Number(day.date.slice(8))}</span>
            <span className="month-events" aria-hidden="true">
              {day.blocks.map(entry => <span className="month-event" key={entry.id}>
                <time>{entry.timeKey.split('-')[0]}</time><span>{entry.className}</span>
              </span>)}
            </span>
          </button> : <span className="month-date-number" aria-hidden="true">{day.date && Number(day.date.slice(8))}</span>}
        </td>)}
      </tr>)}</tbody>
    </table>
    {selectedDay && <MonthDay day={selectedDay} onClose={() => setSelected(null)}/>}
  </section>;
}
