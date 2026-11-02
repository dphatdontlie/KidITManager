import { scheduleSlots, isCalendarDate, ATTENDANCE_START_DATE } from '../shared/class-schedule.js';
import { scheduleOnDate } from '../shared/schedule-history.js';
import { slotPeople } from '../shared/class-staff.js';
import { InputError } from './session-domain.js';

const normalize = value => String(value || '').normalize('NFC').trim().toLocaleLowerCase('vi');
const roomKey = value => normalize(value).replace(/^phòng\s+/u, '');
const personNames = value => normalize(value).split(/\s*[,;]\s*/u);
const overlap = (a, b) => a.start_time < b.end_time && a.end_time > b.start_time;
const key = row => `${row.class_id}/${row.date}/${row.start_time}/${row.end_time}`;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const timeText = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const clock = now => ({
  date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now),
  time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now),
});

export function dateRange(from, to) {
  if (!isCalendarDate(from) || !isCalendarDate(to) || from < ATTENDANCE_START_DATE || to < from) throw new InputError('Chọn khoảng ngày hợp lệ từ 01/10/2026.');
  const length = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (length > 31) throw new InputError('Mỗi lần tra cứu tối đa 31 ngày.');
  return Array.from({ length }, (_, i) => new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10));
}

async function loadClasses(db) {
  const [classes] = await db.query('SELECT id,name,teacher,ta,schedule,room FROM classes ORDER BY id');
  const [staff] = await db.query('SELECT class_id,slot,teacher,ta FROM class_slot_staff');
  const [people] = await db.query('SELECT class_id,slot,name,role FROM class_slot_people ORDER BY position');
  const [history] = await db.query('SELECT class_id,effective_date,payload FROM class_schedule_history ORDER BY effective_date');
  return classes.map(cls => ({ ...cls,
    slot_staff: staff.filter(s => s.class_id === cls.id).map(s => {
      const assigned = people.filter(p => p.class_id === cls.id && p.slot === s.slot).map(({ name, role }) => ({ name, role }));
      return { ...s, ...(assigned.length ? { staff: assigned } : {}) };
    }),
    schedule_history: history.filter(h => h.class_id === cls.id).map(h => ({ effective_date: h.effective_date, ...JSON.parse(h.payload) })),
  }));
}

export function scheduledSessions(classes, dates) {
  return dates.flatMap(date => classes.flatMap(cls => {
    const snapshot = scheduleOnDate(cls, date);
    return scheduleSlots(snapshot.schedule, date).map(slot => ({
      class_id: cls.id, class_name: cls.name, date, start_time: slot.start_time, end_time: slot.end_time,
      room: snapshot.room || '', staff: slotPeople(snapshot.slot_staff?.find(s => s.slot === slot.label) || snapshot),
    }));
  })).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time) || a.class_id - b.class_id);
}

async function loadRecords(db, from, to) {
  const [personal] = await db.query('SELECT id,class_id,date,start_time,end_time,teacher_name,lesson,role,status FROM personal_attendance WHERE date>=? AND date<=? ORDER BY date,start_time,id', [from, to]);
  const [legacy] = await db.query('SELECT s.id,s.class_id,s.date,s.start_time,s.end_time,s.status,p.teacher_name,p.role FROM teaching_sessions s LEFT JOIN session_staff p ON p.session_id=s.id WHERE s.date>=? AND s.date<=? ORDER BY s.date,s.start_time,s.id', [from, to]);
  return { personal, legacy };
}

function requireClass(classes, id, optional = false) {
  if (optional && id === null) return null;
  if (!Number.isSafeInteger(id) || id < 1) throw new InputError('Mã lớp không hợp lệ.');
  const cls = classes.find(c => c.id === id);
  if (!cls) throw new InputError('Không tìm thấy lớp.');
  return cls;
}

const stringOrNull = { type: ['string', 'null'] };
const classId = { type: ['integer', 'null'], description: 'Mã lớp từ list_classes; null để xem mọi lớp.' };
function tool(name, description, properties) {
  return { type: 'function', name, description, strict: true, parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } };
}
export const assistantTools = [
  tool('list_classes', 'Tìm mã lớp và danh sách nhân sự. Dùng trước khi tra cứu nếu chưa biết mã lớp. Không có số điện thoại hoặc dữ liệu tài chính.', { query: stringOrNull }),
  tool('lookup_sessions', 'Tra lịch, bài học thực tế từng người, ghi chú giảng dạy theo ngày, và các suất đã kết thúc chưa có bài học xác nhận. Tối đa 31 ngày. Bài học khác nhau được báo xung đột. Không có bản ghi không có nghĩa chưa dạy.', {
    from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD, bao gồm ngày này' }, class_id: classId, person: stringOrNull, only_missing: { type: 'boolean' },
  }),
  tool('suggest_slots', 'Đề xuất buổi bổ sung một lần, không lưu. Kiểm tra lịch theo ngày hiệu lực, phòng, nhân sự, lớp, học sinh trùng lớp và công đã ghi. Không chứng minh nhân sự rảnh ngoài lịch đã ghi nhận. Cần hỏi rõ lớp, phòng và tên nhân sự nếu chưa biết.', {
    class_id: { type: 'integer' }, from: { type: 'string' }, to: { type: 'string' },
    staff_names: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20 }, room: { type: 'string' },
    duration_minutes: { type: 'integer', minimum: 30, maximum: 240 }, earliest_start: { type: 'string', description: 'HH:mm' }, latest_end: { type: 'string', description: 'HH:mm' },
  }),
];

export function createAssistantTools(db, { now = () => new Date() } = {}) {
  return async (name, args) => {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new InputError('Tham số tra cứu không hợp lệ.');
    const schema = assistantTools.find(t => t.name === name);
    if (!schema) throw new InputError('Chức năng không được hỗ trợ.');
    if (Object.keys(args).some(k => !Object.hasOwn(schema.parameters.properties, k)) || schema.parameters.required.some(k => !Object.hasOwn(args, k))) throw new InputError('Tham số tra cứu không đúng cấu trúc.');
    const classes = await loadClasses(db);
    if (name === 'list_classes') {
      if (args.query !== null && (typeof args.query !== 'string' || args.query.length > 100)) throw new InputError('Tên tìm kiếm tối đa 100 ký tự.');
      const [teachers] = await db.query('SELECT id,name FROM teachers ORDER BY id');
      const found = classes.filter(c => !args.query || normalize(c.name).includes(normalize(args.query)));
      return { data: { classes: found.slice(0, 100).map(c => ({ id: c.id, name: c.name })), total_classes: found.length, truncated: found.length > 100, staff: teachers.slice(0, 100), staff_truncated: teachers.length > 100 }, sources: found.slice(0, 100).map(c => ({ label: c.name, href: `/classes/${c.id}` })) };
    }
    const dates = dateRange(args.from, args.to);
    const cls = requireClass(classes, args.class_id, name === 'lookup_sessions');
    const { personal, legacy } = await loadRecords(db, args.from, args.to);
    const scheduled = scheduledSessions(classes, dates);
    const today = clock(now());
    if (name === 'lookup_sessions') {
      if (typeof args.only_missing !== 'boolean' || (args.person !== null && (typeof args.person !== 'string' || args.person.length > 255))) throw new InputError('Bộ lọc không hợp lệ.');
      const [notes] = await db.query("SELECT id,class_id,date,content,author_name FROM class_notes WHERE date>=? AND date<=? AND category='teaching' ORDER BY date,id", [args.from, args.to]);
      // Retain actual records even when their old slot is no longer on the timetable.
      const sessions = new Map(scheduled.map(s => [key(s), { ...s, scheduled: true }]));
      for (const record of [...personal, ...legacy]) if (!sessions.has(key(record))) {
        const c = classes.find(c => c.id === record.class_id);
        sessions.set(key(record), { class_id: record.class_id, class_name: c?.name || 'Lớp cũ', date: record.date, start_time: record.start_time, end_time: record.end_time, room: '', staff: [], scheduled: false });
      }
      const rows = [...sessions.values()].filter(s => !cls || s.class_id === cls.id).map(s => {
        const entries = personal.filter(p => key(p) === key(s));
        const old = legacy.filter(p => key(p) === key(s));
        const lessons = [...new Set(entries.filter(p => p.status === 'completed' && p.lesson?.trim()).map(p => p.lesson.trim()))];
        const ended = s.date < today.date || (s.date === today.date && s.end_time <= today.time);
        return { ...s, records: entries, legacy_records: old,
          lesson_state: lessons.length > 1 ? 'conflicting' : lessons.length ? 'recorded' : 'unrecorded',
          missing_lesson: ended && lessons.length === 0,
          day_notes: notes.filter(n => n.class_id === s.class_id && n.date === s.date).map(n => ({ id: n.id, content: n.content.slice(0, 2000), truncated: n.content.length > 2000, author: n.author_name })),
        };
      }).filter(s => (!args.only_missing || s.missing_lesson) && (!args.person || [...s.staff.map(p => p.name), ...s.records.map(p => p.teacher_name), ...s.legacy_records.map(p => p.teacher_name)].some(n => normalize(n).includes(normalize(args.person)))))
        .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time) || a.class_id - b.class_id);
      return { data: { sessions: rows.slice(0, 120), total: rows.length, truncated: rows.length > 120, note: 'Ghi chú theo ngày, không gắn riêng từng suất. missing_lesson chỉ là suất đã kết thúc chưa có tên bài trong công xác nhận, không kết luận chưa dạy. Công cũ và công hủy/nháp được hiển thị riêng.' },
        sources: [...new Map(rows.slice(0, 120).map(s => [key(s), { label: `${s.class_name} · ${s.date} · ${s.start_time}-${s.end_time}`, href: `/classes/${s.class_id}`, date: s.date, start_time: s.start_time, end_time: s.end_time }])).values()] };
    }
    if (!Array.isArray(args.staff_names) || !args.staff_names.length || args.staff_names.length > 20 || args.staff_names.some(n => typeof n !== 'string' || !n.trim() || n.length > 255) || new Set(args.staff_names.map(normalize)).size !== args.staff_names.length) throw new InputError('Chọn danh sách nhân sự hợp lệ, không trùng tên.');
    if (typeof args.room !== 'string' || !args.room.trim() || args.room.length > 255) throw new InputError('Cần chọn phòng cụ thể để kiểm tra lịch.');
    if (!Number.isInteger(args.duration_minutes) || args.duration_minutes < 30 || args.duration_minutes > 240 || !timePattern.test(args.earliest_start) || !timePattern.test(args.latest_end) || minutes(args.latest_end) - minutes(args.earliest_start) < args.duration_minutes) throw new InputError('Thời lượng hoặc khung giờ không hợp lệ.');
    const [teachers] = await db.query('SELECT id,name FROM teachers');
    for (const name of args.staff_names) if (teachers.filter(t => normalize(t.name) === normalize(name)).length !== 1) throw new InputError(`Nhân sự “${name}” không tồn tại hoặc trùng tên. Cần làm rõ trước khi đề xuất.`);
    const [enrollments] = await db.query('SELECT class_id,student_id FROM class_students');
    const targetStudents = new Set(enrollments.filter(e => e.class_id === cls.id).map(e => e.student_id));
    const relatedClasses = new Set(enrollments.filter(e => targetStudents.has(e.student_id)).map(e => e.class_id));
    const busy = [...scheduled, ...personal.filter(p => p.status !== 'cancelled').map(p => ({ ...p, room: '', staff: [{ name: p.teacher_name }] })), ...legacy.filter(p => p.status !== 'cancelled').map(p => ({ ...p, room: '', staff: p.teacher_name ? [{ name: p.teacher_name }] : [] }))];
    const proposals = []; const rejected = []; let rejectedCount = 0;
    for (const date of dates) {
      for (let m = minutes(args.earliest_start); m + args.duration_minutes <= minutes(args.latest_end); m += 30) {
        const candidate = { class_id: cls.id, class_name: cls.name, date, start_time: timeText(m), end_time: timeText(m + args.duration_minutes), room: args.room.trim(), staff_names: args.staff_names };
        if (date < today.date || (date === today.date && candidate.start_time <= today.time)) continue;
        const conflicts = busy.filter(b => b.date === date && overlap(b, candidate) && (b.class_id === cls.id || relatedClasses.has(b.class_id) || (b.room && roomKey(b.room) === roomKey(args.room)) || b.staff.some(p => args.staff_names.some(n => personNames(p.name).includes(normalize(n))))));
        if (!conflicts.length) proposals.push(candidate);
        else { rejectedCount++; if (rejected.length < 5) rejected.push({ ...candidate, conflicts: [...new Set(conflicts.map(c => `${classes.find(cl => cl.id === c.class_id)?.name || c.class_id} ${c.start_time}-${c.end_time}`))] }); }
      }
    }
    return { data: { proposals: proposals.slice(0, 12), total: proposals.length, truncated: proposals.length > 12, rejected_count: rejectedCount, rejected_examples: rejected, note: 'Đề xuất buổi bổ sung một lần, chưa lưu. Chỉ kiểm tra dữ liệu đã ghi nhận và danh sách học sinh hiện tại; chưa có lịch rảnh, nghỉ phép, thời gian di chuyển, danh mục phòng hoặc buổi nghỉ ngoại lệ. Không khẳng định nhân sự rảnh. Không thay đổi lịch tuần.' }, sources: [{ label: `Lịch lớp ${cls.name}`, href: `/classes/${cls.id}` }, { label: `Lịch trung tâm ${args.from} đến ${args.to}`, href: '/schedule' }] };
  };
}
