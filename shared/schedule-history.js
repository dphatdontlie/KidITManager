import { attendanceDatesInMonth, isCalendarDate } from './class-schedule.js';

export function scheduleOnDate(cls, date) {
  if (!isCalendarDate(date) || !cls?.schedule_history?.length) return cls || {};
  const version = cls.schedule_history.filter(row => row.effective_date <= date)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  return version ? { ...cls, ...version } : { ...cls, schedule: '', teacher: '', ta: '', slot_staff: [] };
}

export function classAttendanceDates(cls, month) {
  const candidates = new Set([cls, ...(cls?.schedule_history || [])].flatMap(row => attendanceDatesInMonth(row?.schedule, month)));
  return [...candidates].filter(date => attendanceDatesInMonth(scheduleOnDate(cls, date).schedule, month).includes(date)).sort();
}

export function scheduleSnapshot(cls, slot_staff) {
  return { schedule: cls.schedule || '', teacher: cls.teacher || '', ta: cls.ta || '', room: cls.room || '', slot_staff };
}
