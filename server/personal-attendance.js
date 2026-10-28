import { InputError, validateSession } from './session-domain.js';
import { scheduleSlots } from '../shared/class-schedule.js';
import { payRateOnDate, validStaffing, withSessionPay } from '../shared/payroll.js';
import { applyClassPayRates, readClassPayRates, snapshotPay, validMoney } from './pay-rates.js';
import { classOnDate } from './schedule-history.js';

export function registerPersonalAttendance(app, pool) {
  const db = pool.promise();
  app.use('/api/classes/:id/sessions', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) return res.status(410).json({ error: 'Hãy dùng chấm công cá nhân bằng tài khoản giáo viên. Buổi dạy cũ chỉ dùng để đối chiếu.' });
    next();
  });
  app.get('/api/classes/:id/personal-attendance', async (req, res, next) => {
    try {
      const [rows] = await db.query('SELECT a.*,p.teacher_count,p.ta_count FROM personal_attendance a LEFT JOIN attendance_payroll p ON p.attendance_id=a.id WHERE a.class_id=? ORDER BY a.date DESC,a.start_time DESC,a.teacher_name', [req.params.id]);
      res.json(await applyClassPayRates(db, rows));
    } catch (error) { next(error); }
  });
  const save = async (req, res, next) => {
    let connection;
    try {
      const admin = req.user?.role === 'admin';
      const teacherId = admin ? Number(req.body?.teacher_id) : req.user?.teacher_id;
      if (!Number.isSafeInteger(teacherId) || teacherId < 1) throw new InputError('Hãy chọn giáo viên để chấm công.', 403);
      const { lesson, slot, role, teacher_count, ta_count, ...body } = req.body || {};
      if (!validStaffing(teacher_count, ta_count, role)) throw new InputError('Hãy chọn đội hình thực tế: ít nhất 1 giáo viên, tối đa 20 người và có trợ giảng nếu bạn chọn vai trò trợ giảng.');
      if (typeof lesson !== 'string' || !lesson.trim() || lesson.length > 255) throw new InputError('Hãy nhập tên bài học, tối đa 255 ký tự.');
      const singleTeacher = req.body.single_teacher === true;
      if (req.body.recalculate !== undefined && typeof req.body.recalculate !== 'boolean') throw new InputError('Lựa chọn tính lại lương không hợp lệ.');
      if (req.body.single_teacher !== undefined && typeof req.body.single_teacher !== 'boolean') throw new InputError('Trường hợp dạy thay phải là đúng hoặc sai.');
      if (singleTeacher && (teacher_count !== 1 || role !== 'teacher')) throw new InputError('Chỉ chọn dạy thay hai giáo viên khi thực tế có đúng một giáo viên và bạn dạy chính.');
      if (!admin && (req.body.override_amount !== undefined || req.body.override_reason !== undefined || req.body.recalculate)) throw new InputError('Chỉ admin được đặt đơn giá riêng hoặc tính lại lương.', 403);
      const input = validateSession({ ...body, staff: [{ teacher_id: teacherId, role }] });
      connection = await db.getConnection(); await connection.beginTransaction();
      const [[teacher]] = await connection.query('SELECT id,name FROM teachers WHERE id=? FOR UPDATE', [teacherId]);
      const [[cls]] = await connection.query('SELECT id,schedule FROM classes WHERE id=? FOR UPDATE', [req.params.id]);
      if (!cls || !teacher) throw new InputError('Không tìm thấy lớp hoặc giáo viên.', 404);
      let existing;
      if (req.params.entryId) {
        [[existing]] = await connection.query('SELECT a.*,p.teacher_count,p.ta_count FROM personal_attendance a LEFT JOIN attendance_payroll p ON p.attendance_id=a.id WHERE a.id=? AND a.class_id=? FOR UPDATE', [req.params.entryId, cls.id]);
        if (!existing) throw new InputError('Không tìm thấy lượt chấm công.', 404);
        if (existing.teacher_id !== teacher.id) throw new InputError('Bạn chỉ được sửa công của mình.', 403);
        if (existing.version !== input.version) throw new InputError('Dữ liệu vừa thay đổi. Hãy tải lại trước khi lưu.', 409);
      }
      const unchangedSlot = existing && existing.date === input.date && existing.slot === slot && existing.start_time === input.start_time && existing.end_time === input.end_time;
      const dated = await classOnDate(connection, cls, input.date);
      if (!unchangedSlot && !scheduleSlots(dated.schedule, input.date).some(s => s.label === slot && s.start_time === input.start_time && s.end_time === input.end_time)) throw new InputError('Hãy chọn suất có trong lịch lớp đúng ngày dạy.');
      if (input.status !== 'cancelled') {
        const [conflicts] = await connection.query("SELECT id FROM personal_attendance WHERE teacher_id=? AND date=? AND status<>'cancelled' AND start_time<? AND end_time>? AND id<>?", [teacher.id, input.date, input.end_time, input.start_time, existing?.id || 0]);
        const [legacy] = await connection.query("SELECT s.id FROM session_staff a JOIN teaching_sessions s ON s.id=a.session_id WHERE a.teacher_id=? AND s.date=? AND s.status<>'cancelled' AND s.start_time<? AND s.end_time>?", [teacher.id, input.date, input.end_time, input.start_time]);
        if (conflicts.length || legacy.length) throw new InputError('Bạn đã có bản ghi công trùng giờ này. Hãy sửa bản ghi hiện có.', 409);
      }
      const [[detail]] = existing ? await connection.query('SELECT * FROM attendance_pay_details WHERE attendance_id=?', [existing.id]) : [[]];
      const overrideAmount = admin && req.body.override_amount !== undefined ? req.body.override_amount : detail?.override_amount == null ? null : Number(detail.override_amount);
      const overrideReason = admin && req.body.override_reason !== undefined ? req.body.override_reason : detail?.override_reason || '';
      if ((overrideAmount !== null && !validMoney(overrideAmount)) || typeof overrideReason !== 'string' || overrideReason.length > 1000 || (overrideAmount !== null && !overrideReason.trim())) throw new InputError('Đơn giá riêng phải là số nguyên không âm và có lý do tối đa 1.000 ký tự.');
      const configured = payRateOnDate((await readClassPayRates(connection)).find(r => r.class_id === cls.id), input.date);
      const computed = withSessionPay({ ...input, role, teacher_count, ta_count, single_teacher: singleTeacher, override_amount: overrideAmount, class_pay_rate: configured });
      const snapshot = input.status === 'completed' ? existing?.status === 'completed' && detail?.snapshot && !req.body.recalculate ? detail.snapshot : snapshotPay(computed) : null;
      if (admin && existing?.status === 'completed' && detail?.snapshot && !req.body.recalculate && (overrideAmount !== (detail.override_amount == null ? null : Number(detail.override_amount)) || overrideReason !== detail.override_reason)) throw new InputError('Hãy chọn tính lại lương khi thay đổi đơn giá riêng của công đã xác nhận.');
      const values = [teacher.name, input.date, input.start_time, input.end_time, slot, lesson.trim(), role, input.status, input.notes];
      let id = existing?.id;
      if (existing) await connection.query('UPDATE personal_attendance SET teacher_name=?,date=?,start_time=?,end_time=?,slot=?,lesson=?,role=?,status=?,notes=?,version=version+1 WHERE id=?', [...values, id]);
      else {
        const [result] = await connection.query('INSERT INTO personal_attendance (teacher_name,date,start_time,end_time,slot,lesson,role,status,notes,teacher_id,class_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [...values, teacher.id, cls.id]);
        id = result.insertId;
      }
      await connection.query('DELETE FROM attendance_payroll WHERE attendance_id=?', [id]);
      await connection.query('INSERT INTO attendance_payroll (attendance_id,teacher_count,ta_count) VALUES (?,?,?)', [id, teacher_count, ta_count]);
      await connection.query('DELETE FROM attendance_pay_details WHERE attendance_id=?', [id]);
      await connection.query('INSERT INTO attendance_pay_details (attendance_id,single_teacher,override_amount,override_reason,snapshot) VALUES (?,?,?,?,?)', [id, Number(singleTeacher), overrideAmount, overrideReason.trim(), snapshot]);
      if (admin) await connection.query('INSERT INTO attendance_actions (attendance_id,actor_account_id,actor_name,action,payload) VALUES (?,?,?,?,?)', [id, req.user.id, req.user.name, existing ? 'update' : 'create', JSON.stringify({ before: existing ? { ...existing, pay_details: detail || null } : null, after: { teacher_id: teacherId, ...req.body } })]);
      await connection.commit(); res.json({ id, success: true });
    } catch (error) { if (connection) await connection.rollback(); next(error); } finally { connection?.release(); }
  };
  app.post('/api/classes/:id/personal-attendance', save);
  app.put('/api/classes/:id/personal-attendance/:entryId', save);
  app.delete('/api/classes/:id/personal-attendance/:entryId', async (req, res, next) => {
    let connection;
    try {
      if (!req.user?.teacher_id) throw new InputError('Bạn chỉ được xóa công của mình bằng tài khoản giáo viên.', 403);
      const version = req.body?.version;
      if (!Number.isInteger(version) || version < 1) throw new InputError('Thiếu phiên bản bản ghi. Hãy tải lại trước khi xóa.');
      connection = await db.getConnection(); await connection.beginTransaction();
      const [[existing]] = await connection.query('SELECT * FROM personal_attendance WHERE id=? AND class_id=? FOR UPDATE', [req.params.entryId, req.params.id]);
      if (!existing) throw new InputError('Không tìm thấy lượt chấm công.', 404);
      if (existing.teacher_id !== req.user.teacher_id) throw new InputError('Bạn chỉ được xóa công của mình.', 403);
      if (existing.version !== version) throw new InputError('Dữ liệu vừa thay đổi. Hãy tải lại trước khi xóa.', 409);
      await connection.query('DELETE FROM personal_attendance WHERE id=?', [existing.id]);
      await connection.commit(); res.json({ success: true });
    } catch (error) { if (connection) await connection.rollback(); next(error); } finally { connection?.release(); }
  });
}
