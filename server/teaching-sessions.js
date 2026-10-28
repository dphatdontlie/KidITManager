import { InputError, validateSession, monthRange } from './session-domain.js';
import { staffingCounts, withSessionPay } from '../shared/payroll.js';
import { applyClassPayRates } from './pay-rates.js';

export function registerTeachingSessions(app, pool) {
  const db = pool.promise();
  app.get('/api/classes/:id/sessions', async (req, res, next) => {
    try {
      const [rows] = await db.query('SELECT * FROM teaching_sessions WHERE class_id = ? ORDER BY date DESC, start_time DESC', [req.params.id]);
      const [staff] = await db.query(`SELECT a.id, a.session_id, a.teacher_id, a.teacher_name, a.role FROM session_staff a JOIN teaching_sessions s ON a.session_id = s.id WHERE s.class_id = ?`, [req.params.id]);
      res.json(rows.map(row => ({ ...row, staff: staff.filter(s => s.session_id === row.id) })));
    } catch (error) { next(error); }
  });

  const save = async (req, res, next) => {
    let connection;
    try {
      const input = validateSession(req.body);
      connection = await db.getConnection();
      await connection.beginTransaction();
      // Serializes session changes for this class, including duplicate-create checks.
      const [[cls]] = await connection.query('SELECT id FROM classes WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!cls) throw new InputError('Không tìm thấy lớp.', 404);
      let sessionId = req.params.sessionId;
      if (sessionId) {
        const [[existing]] = await connection.query('SELECT * FROM teaching_sessions WHERE id = ? AND class_id = ? FOR UPDATE', [sessionId, req.params.id]);
        if (!existing) throw new InputError('Không tìm thấy buổi dạy.', 404);
        if (existing.version !== input.version) throw new InputError('Buổi này vừa được người khác sửa. Hãy tải lại trước khi lưu.', 409);
      }
      const [overlap] = await connection.query(`SELECT id FROM teaching_sessions WHERE class_id = ? AND date = ? AND status <> 'cancelled' AND start_time < ? AND end_time > ? AND id <> ?`,
        [req.params.id, input.date, input.end_time, input.start_time, sessionId || 0]);
      if (input.status !== 'cancelled' && overlap.length) throw new InputError('Lớp đã có buổi dạy trùng giờ này.', 409);
      const snapshots = [];
      for (const row of input.staff) {
        const [[teacher]] = await connection.query('SELECT id, name FROM teachers WHERE id = ?', [row.teacher_id]);
        if (!teacher) throw new InputError('Nhân sự đã bị xóa. Hãy tải lại danh sách.');
        snapshots.push({ ...row, teacher_name: teacher.name });
      }
      const values = [input.date, input.start_time, input.end_time, input.status, input.notes];
      if (sessionId) {
        await connection.query('UPDATE teaching_sessions SET date=?, start_time=?, end_time=?, status=?, notes=?, version=version+1 WHERE id=?', [...values, sessionId]);
        await connection.query('DELETE FROM session_staff WHERE session_id=?', [sessionId]);
      } else {
        const [result] = await connection.query('INSERT INTO teaching_sessions (date,start_time,end_time,status,notes,class_id) VALUES (?,?,?,?,?,?)', [...values, req.params.id]);
        sessionId = result.insertId;
      }
      // Keep the legacy NOT NULL column compatible; work is counted by session, never by this value.
      for (const row of snapshots) await connection.query('INSERT INTO session_staff (session_id,teacher_id,teacher_name,role,minutes) VALUES (?,?,?,?,0)',
        [sessionId, row.teacher_id, row.teacher_name, row.role]);
      await connection.query('INSERT INTO session_revisions (session_id,payload) VALUES (?,?)', [sessionId, JSON.stringify({ ...input, staff: snapshots })]);
      await connection.commit();
      res.json({ id: Number(sessionId), success: true });
    } catch (error) {
      if (connection) await connection.rollback();
      next(error);
    } finally { connection?.release(); }
  };
  app.post('/api/classes/:id/sessions', save);
  app.put('/api/classes/:id/sessions/:sessionId', save);

  app.get('/api/payroll', async (req, res, next) => {
    try {
      const [from, to] = monthRange(req.query.month);
      const [rows] = await db.query(`SELECT a.teacher_id, a.teacher_name, a.role, 1 AS work_units, s.id AS session_id, s.class_id, c.name AS class_name, s.date, s.start_time, s.end_time, s.notes, '' AS lesson, '' AS slot
        FROM session_staff a JOIN teaching_sessions s ON s.id=a.session_id JOIN classes c ON c.id=s.class_id
        WHERE s.status='completed' AND s.date>=? AND s.date<? ORDER BY s.date,s.start_time,a.teacher_name`, [from, to]);
      const [legacy] = await db.query(`SELECT a.*, c.name AS class_name FROM teacher_attendance a JOIN classes c ON c.id=a.class_id WHERE a.date>=? AND a.date<? ORDER BY a.date`, [from, to]);
      let personal = [];
      let entries = [];
      if (req.user) {
        [entries] = await db.query('SELECT a.*,c.name AS class_name,p.teacher_count,p.ta_count,(SELECT actor_name FROM attendance_actions WHERE attendance_id=a.id ORDER BY id DESC LIMIT 1) AS recorded_by FROM personal_attendance a JOIN classes c ON c.id=a.class_id LEFT JOIN attendance_payroll p ON p.attendance_id=a.id WHERE a.date>=? AND a.date<? ORDER BY a.date,a.start_time,a.teacher_name', [from, to]);
        entries = await applyClassPayRates(db, entries);
        personal = entries.filter(row => row.status === 'completed').map(row => ({ ...row, session_id: `personal-${row.id}`, work_units: 1 }));
      }
      const counts = new Map();
      for (const row of rows) {
        const staff = counts.get(row.session_id) || [];
        staff.push(row); counts.set(row.session_id, staff);
      }
      const historic = await applyClassPayRates(db, rows.map(row => withSessionPay({ ...row, status: 'completed', ...staffingCounts(counts.get(row.session_id)) })));
      const combined = [...historic, ...personal].sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time) || a.teacher_name.localeCompare(b.teacher_name, 'vi'));
      res.json({ basis: 'session', rows: combined, legacy, entries });
    } catch (error) { next(error); }
  });
}
