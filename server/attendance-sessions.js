import { isCalendarDate, ATTENDANCE_START_DATE, scheduleSlots } from '../shared/class-schedule.js';
import { slotPeople } from '../shared/class-staff.js';
import { classOnDate } from './schedule-history.js';
import { InputError } from './session-domain.js';

const normalized = value => String(value || '').normalize('NFC').trim().toLocaleLowerCase('vi');
const validDay = date => {
  if (!isCalendarDate(date) || date < ATTENDANCE_START_DATE) throw new InputError('Ngày điểm danh không hợp lệ.');
  return date;
};
function checkVersion(value, expected) {
  if (!Number.isInteger(value) || value !== expected) throw new InputError('Phiên hoặc học sinh vừa được cập nhật. Hãy tải lại trước khi lưu.', 409);
}

async function resolvedClass(db, id, date, lock = false) {
  const [[cls]] = await db.query(`SELECT * FROM classes WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!cls) throw new InputError('Không tìm thấy lớp.', 404);
  const [staff] = await db.query('SELECT * FROM class_slot_staff WHERE class_id=?', [id]);
  const [people] = await db.query('SELECT * FROM class_slot_people WHERE class_id=? ORDER BY position', [id]);
  return classOnDate(db, { ...cls, slot_staff: staff.map(s => {
    const rows = people.filter(p => p.slot === s.slot);
    return { ...s, ...(rows.length ? { staff: rows } : {}) };
  }) }, date);
}

async function assignedAccounts(db, cls, slot) {
  const people = slotPeople(cls.slot_staff?.find(s => s.slot === slot.label) || cls);
  const names = people.flatMap(p => String(p.name || '').split(/[,;\n]/).map(normalized)).filter(Boolean);
  const [teachers] = await db.query('SELECT id,name FROM teachers');
  const [accounts] = await db.query('SELECT id,teacher_id FROM accounts WHERE teacher_id IS NOT NULL');
  const ids = new Set(names.flatMap(name => {
    const matches = teachers.filter(t => normalized(t.name) === name);
    if (matches.length === 1) return [matches[0].id];
    return !matches.length && /^\d+$/.test(name) ? [Number(name)] : [];
  }));
  return accounts.filter(a => ids.has(a.teacher_id)).map(a => a.id);
}

export function registerAttendanceSessions(app, pool, { now = Date.now } = {}) {
  const db = pool.promise();
  const base = '/api/classes/:id/attendance-sessions';
  app.use(base, (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Vui lòng đăng nhập.' }));
  const canManage = async (connection, req, session) => {
    if (req.user.role === 'admin') return true;
    const [[row]] = await connection.query('SELECT account_id FROM student_attendance_session_staff WHERE session_id=? AND account_id=?', [session.id, req.user.id]);
    return !!row;
  };
  const audit = (connection, req, sessionId, action, payload, studentId = null) => connection.query(
    'INSERT INTO student_attendance_actions (session_id,student_id,actor_name,action,payload) VALUES (?,?,?,?,?)',
    [sessionId, studentId, req.user.name, action, JSON.stringify(payload)]);
  app.get(base, async (req, res, next) => {
    try {
      const date = validDay(req.query.date);
      const cls = await resolvedClass(db, req.params.id, date);
      const instant = now();
      const slots = await Promise.all(scheduleSlots(cls.schedule, date).map(async slot => {
        const assigned = await assignedAccounts(db, cls, slot);
        const start = Date.parse(`${date}T${slot.start_time}:00+07:00`);
        const end = Date.parse(`${date}T${slot.end_time}:00+07:00`);
        return { ...slot, can_open: instant >= start && instant < end && (req.user.role === 'admin' || assigned.includes(req.user.id)) };
      }));
      const [sessions] = await db.query('SELECT * FROM student_attendance_sessions WHERE class_id=? AND date=? ORDER BY start_time', [req.params.id, date]);
      const [entries] = await db.query(`SELECT e.* FROM student_attendance_entries e JOIN student_attendance_sessions s ON s.id=e.session_id
        WHERE s.class_id=? AND s.date=? ORDER BY e.id`, [req.params.id, date]);
      const [legacy] = await db.query('SELECT a.student_id,s.name AS student_name,a.status FROM attendance a LEFT JOIN students s ON s.id=a.student_id WHERE a.class_id=? AND a.date=?', [req.params.id, date]);
      res.json({ slots, server_time: new Date(instant).toISOString(), legacy,
        sessions: await Promise.all(sessions.map(async s => ({ ...s, can_manage: await canManage(db, req, s), can_reopen: req.user.role === 'admin', entries: entries.filter(e => e.session_id === s.id) }))) });
    } catch (error) { next(error); }
  });
  app.post(base, async (req, res, next) => {
    let connection;
    try {
      const date = validDay(req.body?.date);
      connection = await db.getConnection(); await connection.beginTransaction();
      const cls = await resolvedClass(connection, req.params.id, date, true);
      const slot = scheduleSlots(cls.schedule, date).find(s => s.start_time === req.body.start_time && s.end_time === req.body.end_time);
      if (!slot) throw new InputError('Suất học không có trong lịch hiệu lực. Hãy tải lại lịch lớp.', 409);
      const assigned = await assignedAccounts(connection, cls, slot);
      if (req.user.role !== 'admin' && !assigned.includes(req.user.id)) throw new InputError('Chỉ admin hoặc nhân sự được phân công suất này được mở điểm danh.', 403);
      const instant = now();
      if (instant < Date.parse(`${date}T${slot.start_time}:00+07:00`) || instant >= Date.parse(`${date}T${slot.end_time}:00+07:00`)) {
        throw new InputError('Chỉ mở phiên trong thời gian diễn ra suất học, theo giờ Việt Nam.', 409);
      }
      const [[existing]] = await connection.query('SELECT id,state FROM student_attendance_sessions WHERE class_id=? AND date=? AND start_time=?', [req.params.id, date, slot.start_time]);
      if (existing) { await connection.commit(); return res.json({ id: existing.id, existing: true }); }
      const [students] = await connection.query('SELECT s.id,s.name FROM students s JOIN class_students cs ON cs.student_id=s.id WHERE cs.class_id=? ORDER BY s.name', [req.params.id]);
      if (!students.length) throw new InputError('Thêm học sinh vào lớp trước khi mở phiên.', 409);
      const [result] = await connection.query('INSERT INTO student_attendance_sessions (class_id,date,start_time,end_time,opened_by,opened_name) VALUES (?,?,?,?,?,?)', [req.params.id, date, slot.start_time, slot.end_time, req.user.id, req.user.name]);
      const id = result.insertId;
      for (const accountId of assigned) await connection.query('INSERT INTO student_attendance_session_staff (session_id,account_id) VALUES (?,?)', [id, accountId]);
      for (const student of students) await connection.query('INSERT INTO student_attendance_entries (session_id,student_id,student_name) VALUES (?,?,?)', [id, student.id, student.name]);
      await audit(connection, req, id, 'open', { date, ...slot, students: students.length });
      await connection.commit(); res.json({ id, existing: false });
    } catch (error) { if (connection) await connection.rollback(); next(error); } finally { connection?.release(); }
  });
  const mutate = handler => async (req, res, next) => {
    let connection;
    try {
      connection = await db.getConnection(); await connection.beginTransaction();
      const [[session]] = await connection.query('SELECT * FROM student_attendance_sessions WHERE id=? AND class_id=? FOR UPDATE', [req.params.sessionId, req.params.id]);
      if (!session) throw new InputError('Không tìm thấy phiên điểm danh.', 404);
      if (!await canManage(connection, req, session)) throw new InputError('Bạn không có quyền sửa phiên điểm danh này.', 403);
      await handler(connection, req, session);
      await connection.commit(); res.json({ success: true });
    } catch (error) { if (connection) await connection.rollback(); next(error); } finally { connection?.release(); }
  };
  app.post(`${base}/:sessionId/students/:studentId`, mutate(async (connection, req, session) => {
    if (session.state !== 'open') throw new InputError('Phiên đã đóng. Admin cần mở lại trước khi sửa.', 409);
    const status = req.body?.status;
    if (!['present', 'absent', 'pending'].includes(status)) throw new InputError('Trạng thái điểm danh không hợp lệ.');
    const [[entry]] = await connection.query('SELECT * FROM student_attendance_entries WHERE session_id=? AND student_id=?', [session.id, req.params.studentId]);
    if (!entry) throw new InputError('Học sinh không có trong danh sách chụp lúc mở phiên.', 404);
    checkVersion(req.body.version, entry.version);
    await connection.query('UPDATE student_attendance_entries SET status=?,marked_by=?,marked_at=?,version=version+1 WHERE id=?', [status, req.user.name, status === 'pending' ? null : new Date(now()), entry.id]);
    await audit(connection, req, session.id, 'mark', { before: entry.status, after: status }, entry.student_id);
  }));
  for (const action of ['close', 'reopen']) app.post(`${base}/:sessionId/${action}`, mutate(async (connection, req, session) => {
    if (action === 'reopen' && req.user.role !== 'admin') throw new InputError('Chỉ admin được mở lại phiên đã đóng.', 403);
    checkVersion(req.body?.version, session.version);
    if (session.state !== (action === 'close' ? 'open' : 'closed')) throw new InputError('Trạng thái phiên đã thay đổi. Hãy tải lại.', 409);
    await connection.query('UPDATE student_attendance_sessions SET state=?,closed_at=?,version=version+1 WHERE id=?', [action === 'close' ? 'closed' : 'open', action === 'close' ? new Date(now()) : null, session.id]);
    await audit(connection, req, session.id, action, { version: session.version });
  }));
}
