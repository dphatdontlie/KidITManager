import { useEffect, useId, useMemo, useState } from 'react';
import { preferredAttendanceDate, weekdayLabel, isCalendarDate, isScheduledAttendanceDate } from '../../shared/class-schedule.js';
import { localDate } from '../lib/api';
import { classAttendanceDates, scheduleOnDate } from '../../shared/schedule-history.js';

export default function AttendancePicker({ schedule, scheduleHistory, value, onChange, label = 'Buổi điểm danh', disabled = false, savedDate = '' }) {
  const today = localDate();
  const id = useId();
  const initial = value?.slice(0, 7) || today.slice(0, 7);
  const [month, setMonth] = useState(initial.slice(5));
  const [year, setYear] = useState(initial.slice(0, 4));
  const dates = useMemo(() => {
    const rows = classAttendanceDates({ schedule, schedule_history: scheduleHistory }, `${year}-${month}`);
    if (isCalendarDate(savedDate) && savedDate.slice(0,7) === `${year}-${month}` && !rows.includes(savedDate)) rows.push(savedDate);
    return rows.sort();
  }, [schedule, scheduleHistory, year, month, savedDate]);
  useEffect(() => {
    if (dates.includes(value)) return;
    const next = preferredAttendanceDate(dates, today);
    if (next !== value) onChange(next);
  }, [dates, value, onChange, today]);
  const validYear = /^\d{4}$/.test(year) && (Number(year) >= 2026 || year === savedDate.slice(0,4));
  const firstMonth = year === '2026' ? 10 : 1;
  return <fieldset className="scheduled-date-picker" disabled={disabled}>
    <legend>{label}</legend>
    <div className="scheduled-date-fields">
      <label htmlFor={`${id}-day`}>Ngày có học<select id={`${id}-day`} aria-label="Ngày có học" value={dates.includes(value) ? value : ''} disabled={!dates.length} onChange={e => onChange(e.target.value)}>
        {!dates.length && <option value="">Không có ngày học</option>}
        {dates.map(date => <option key={date} value={date}>{date.slice(8)} · {weekdayLabel(date)}{date === savedDate && !isScheduledAttendanceDate(scheduleOnDate({ schedule, schedule_history: scheduleHistory }, date).schedule,date) ? ' (đã ghi)' : ''}</option>)}
      </select></label>
      <label htmlFor={`${id}-month`}>Tháng<select id={`${id}-month`} aria-label="Tháng điểm danh" value={month} onChange={e => setMonth(e.target.value)}>
        {[...new Set([...Array.from({ length: 13 - firstMonth }, (_, i) => String(i + firstMonth).padStart(2,'0')), ...(savedDate.slice(0,4) === year ? [savedDate.slice(5,7)] : [])])].sort().map(m => <option key={m} value={m}>{m}</option>)}
      </select></label>
      <label htmlFor={`${id}-year`}>Năm<input id={`${id}-year`} aria-label="Năm điểm danh" type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={year} onChange={e => {
        const next = e.target.value.replace(/\D/g, ''); setYear(next);
        if (next === '2026' && Number(month) < 10) setMonth('10');
      }} /></label>
    </div>
    {!validYear && <p className="picker-error" role="alert">Nhập năm từ 2026 trở đi.</p>}
    {validYear && !dates.length && !disabled && <p className="picker-help">Lớp chưa có lịch học trong tháng này. Hãy kiểm tra lịch lớp.</p>}
  </fieldset>;
}
