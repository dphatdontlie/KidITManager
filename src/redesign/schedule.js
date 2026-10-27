import { isCalendarDate, scheduleSlots, WEEKDAYS } from '../../shared/class-schedule.js';
import { slotPeople, staffNames } from '../../shared/class-staff.js';
import { scheduleOnDate } from '../../shared/schedule-history.js';

export const SCHEDULE_DAYS = [1, 2, 3, 4, 5, 6, 0];
export const TIME_SLOTS = ['07:00-09:00', '09:00-11:00', '15:15-17:15', '17:15-19:15', '19:15-21:15'];

export function shiftScheduleDate(date, days) {
  if (!isCalendarDate(date) || !Number.isInteger(days)) return '';
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  if (Number.isNaN(next.getTime()) || next.getUTCFullYear() < 1000 || next.getUTCFullYear() > 9999) return '';
  return next.toISOString().slice(0, 10);
}

export function scheduleBlocksOnDate(blocks, date) {
  if (!isCalendarDate(date)) return [];
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return blocks.filter(block => block.dayIndex === day).sort((a, b) => a.timeKey.localeCompare(b.timeKey) || a.className.localeCompare(b.className, 'vi', { numeric: true }));
}

export function classSlots(cls, date) {
  cls = scheduleOnDate(cls, date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()));
  return scheduleSlots(cls?.schedule || '', date).map(slot => {
    const staff = slotPeople(cls?.slot_staff?.find(row => row.slot === slot.label) || cls);
    return {
      staff, teacher: staffNames(staff, 'teacher'), ta: staffNames(staff, 'ta'),
      day: WEEKDAYS.findIndex(day => slot.label.startsWith(`${day} (`)),
      start: slot.start_time, end: slot.end_time,
      key: `${slot.start_time}-${slot.end_time}`, label: slot.label,
    };
  });
}

export function scheduleText(rows) {
  return rows.map(row => `${WEEKDAYS[Number(row.day)]} (${row.time.replace('-', ' - ')})`).join(', ');
}

export function classStaff(cls) {
  const slots = classSlots(cls);
  return slots.length ? slots.flatMap(slot => slot.staff.map(p => ({ teacher: p.role === 'teacher' ? p.name : '', ta: p.role === 'ta' ? p.name : '' }))) : [{ teacher: cls.teacher || '', ta: cls.ta || '' }];
}

export function staffSummary(cls, role) {
  return [...new Set(classStaff(cls).map(s => s[role]).filter(Boolean))].join(', ');
}

export function validateScheduleRows(rows, { allowEmpty = false } = {}) {
  if (Array.isArray(rows) && !rows.length && allowEmpty) return '';
  if (!Array.isArray(rows) || !rows.length) return 'Hãy chọn ít nhất một suất học.';
  const used = [];
  for (const row of rows) {
    if (!SCHEDULE_DAYS.includes(Number(row.day)) || !/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(row.time)) return 'Thứ hoặc suất học không hợp lệ.';
    const [start, end] = row.time.split('-');
    if (end <= start) return 'Giờ kết thúc phải sau giờ bắt đầu.';
    if (used.some(s => s.day === Number(row.day) && start < s.end && end > s.start)) return 'Lớp có suất học trùng giờ trong cùng ngày.';
    used.push({ day: Number(row.day), start, end });
    if (row.staff !== undefined) {
      if (!Array.isArray(row.staff) || row.staff.length > 20 || row.staff.some(p => !p?.name?.trim() || !['teacher', 'ta'].includes(p.role))) return 'Hãy chọn nhân sự và vai trò cho từng người.';
      if (new Set(row.staff.map(p => p.name.trim())).size !== row.staff.length) return 'Một người chỉ được phân công một lần trong cùng suất.';
    }
  }
  return '';
}

export function classPayload(values) {
  return { ...(values.effective_date ? { effective_date: values.effective_date } : {}), name: values.name.trim(), teacher: values.teacher || '', ta: values.ta || '', schedule: scheduleText(values.scheduleRows), slot_staff: values.scheduleRows.map(row => ({ slot: scheduleText([row]), ...(row.staff !== undefined ? { staff: row.staff } : { teacher: row.teacher ?? values.teacher ?? '', ta: row.ta ?? values.ta ?? '' }) })), room: values.room || '', capacity: values.capacity == null || values.capacity === '' ? null : Number(values.capacity) };
}

export function buildScheduleBlocks(classes, person, date) {
  return classes.flatMap(cls => classSlots(cls, date).map(slot => ({
    id: `${cls.id}-${slot.day}-${slot.key}`, classId: cls.id, className: cls.name,
    staff: slot.staff, teacher: person(slot.teacher), ta: slot.ta ? person(slot.ta) : '', room: scheduleOnDate(cls, date).room,
    day: WEEKDAYS[slot.day], dayIndex: slot.day, timeKey: slot.key,
  })));
}

export function buildWeekScheduleBlocks(classes, person, reference) {
  if (!isCalendarDate(reference)) return [];
  const weekday = new Date(`${reference}T12:00:00Z`).getUTCDay();
  const monday = shiftScheduleDate(reference, -((weekday + 6) % 7));
  return SCHEDULE_DAYS.flatMap((_, index) => buildScheduleBlocks(classes, person, shiftScheduleDate(monday, index)));
}
