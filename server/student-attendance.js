import { ATTENDANCE_START_DATE, isCalendarDate, isScheduledAttendanceDate } from '../shared/class-schedule.js';
import { InputError } from './session-domain.js';
import { classOnDate, loadScheduleHistory } from './schedule-history.js';
import { classAttendanceDates } from '../shared/schedule-history.js';

function checkDate(schedule, date) {
  if (!isCalendarDate(date) || date < ATTENDANCE_START_DATE) throw new InputError('Chỉ điểm danh từ ngày 01/10/2026 trở đi.');
  if (!isScheduledAttendanceDate(schedule, date)) throw new InputError('Ngày đã chọn không có lịch học của lớp. Vui lòng chọn lại theo lịch mới.', 409);
}

export function registerStudentAttendance(app, pool) {
  const db = pool.promise();
  app.get('/api/class-enrollments', async (req, res, next) => {
    try { const [rows] = await db.query('SELECT class_id,student_id FROM class_students ORDER BY class_id,student_id'); res.json(rows); }
    catch (error) { next(error); }
  });
  app.post('/api/classes/:id/attendance/bulk', async (req, res, next) => {
    let connection;
    try {
      const { date } = req.body || {};
      if (!isCalendarDate(date) || date < ATTENDANCE_START_DATE) throw new InputError('Ngày điểm danh không hợp lệ.');
      connection = await db.getConnection(); await connection.beginTransaction();
      const [[cls]] = await connection.query('SELECT id,schedule FROM classes WHERE id=? FOR UPDATE', [req.params.id]);
      if (!cls) throw new InputError('Không tìm thấy lớp.', 404);
      checkDate((await classOnDate(connection, cls, date)).schedule, date);
      const [students] = await connection.query('SELECT student_id FROM class_students WHERE class_id=?', [req.params.id]);
      for (const student of students) await connection.query(`INSERT INTO attendance (class_id, student_id, date, status) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status)`, [req.params.id, student.student_id, date, 'present']);
      await connection.commit(); res.json({ success: true, count: students.length });
    } catch (error) { if (connection) await connection.rollback(); next(error); } finally { connection?.release(); }
  });
  app.get('/api/classes/:id/attendance-dates', async (req, res, next) => {
    try {
      if (typeof req.query.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)) throw new InputError('Tháng không hợp lệ.');
      const [[cls]] = await db.query('SELECT id, schedule FROM classes WHERE id=?', [req.params.id]);
      if (!cls) throw new InputError('Không tìm thấy lớp.', 404);
      const schedule_history = await loadScheduleHistory(db, cls.id);
      res.json({ start_date: ATTENDANCE_START_DATE, schedule: cls.schedule, schedule_history, dates: classAttendanceDates({ ...cls, schedule_history }, req.query.month) });
    } catch (error) { next(error); }
  });
  app.get('/api/classes/:id/attendance', async (req, res, next) => {
    try {
      if (!isCalendarDate(req.query.date) || req.query.date < ATTENDANCE_START_DATE) throw new InputError('Chỉ điểm danh từ ngày 01/10/2026 trở đi.');
      const [[cls]] = await db.query('SELECT id, schedule FROM classes WHERE id=?', [req.params.id]);
      if (!cls) throw new InputError('Không tìm thấy lớp.', 404);
      checkDate((await classOnDate(db, cls, req.query.date)).schedule, req.query.date);
      const [rows] = await db.query('SELECT student_id, status FROM attendance WHERE class_id=? AND date=?', [req.params.id, req.query.date]);
      res.json(rows);
    } catch (error) { next(error); }
  });
  app.post('/api/classes/:id/attendance', async (req, res, next) => {
    let connection;
    try {
      const { date, student_id, status } = req.body || {};
      if (!isCalendarDate(date) || date < ATTENDANCE_START_DATE || !['present', 'absent'].includes(status) || !Number.isSafeInteger(Number(student_id)) || Number(student_id) < 1)
        throw new InputError('Ngày, học sinh hoặc trạng thái điểm danh không hợp lệ. Chỉ điểm danh từ 01/10/2026.');
      connection = await db.getConnection();
      await connection.beginTransaction();
      // Shares the class-row lock with schedule updates, so a concurrent edit cannot validate an obsolete date.
      const [[cls]] = await connection.query('SELECT id, schedule FROM classes WHERE id=? FOR UPDATE', [req.params.id]);
      if (!cls) throw new InputError('Không tìm thấy lớp.', 404);
      checkDate((await classOnDate(connection, cls, date)).schedule, date);
      const [[enrolled]] = await connection.query('SELECT id FROM class_students WHERE class_id=? AND student_id=?', [req.params.id, student_id]);
      if (!enrolled) throw new InputError('Học sinh không có trong lớp.');
      await connection.query(`INSERT INTO attendance (class_id, student_id, date, status) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status)`, [req.params.id, student_id, date, status]);
      await connection.commit();
      res.json({ success: true });
    } catch (error) {
      if (connection) await connection.rollback();
      next(error);
    } finally { connection?.release(); }
  });
}
