import { InputError, monthRange } from './session-domain.js';

export function registerPayrollBonuses(app, pool) {
  const db = pool.promise();
  app.use('/api/payroll/bonuses', (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Chỉ admin được xem và nhập tiền thưởng.' }));
  app.get('/api/payroll/bonuses', async (req, res, next) => {
    try {
      monthRange(req.query.month);
      const [rows] = await db.query('SELECT * FROM payroll_bonuses WHERE month=? ORDER BY teacher_id', [req.query.month]);
      res.json(rows.map(row => ({ ...row, amount: Number(row.amount) })));
    } catch (error) { next(error); }
  });
  app.put('/api/payroll/bonuses/:teacherId', async (req, res, next) => {
    let connection;
    try {
      const { month, amount, note = '', version } = req.body || {};
      monthRange(month);
      const teacherId = Number(req.params.teacherId);
      if (!Number.isSafeInteger(teacherId) || teacherId < 1 || !Number.isSafeInteger(amount) || amount < 0 || amount > 99999999999999 || typeof note !== 'string' || note.length > 1000 || !Number.isSafeInteger(version) || version < 0) throw new InputError('Tiền thưởng phải là số nguyên không âm. Ghi chú tối đa 1.000 ký tự; hãy cập nhật dữ liệu nếu phiên bản không còn hợp lệ.');
      connection = await db.getConnection(); await connection.beginTransaction();
      const [[teacher]] = await connection.query('SELECT id FROM teachers WHERE id=? FOR UPDATE', [teacherId]);
      if (!teacher) throw new InputError('Không tìm thấy giáo viên.', 404);
      const [[saved]] = await connection.query('SELECT * FROM payroll_bonuses WHERE teacher_id=? AND month=? FOR UPDATE', [teacherId, month]);
      if ((saved?.version || 0) !== version) throw new InputError('Khoản thưởng vừa thay đổi. Hãy cập nhật tổng thanh toán trước khi sửa.', 409);
      const now = new Date().toISOString();
      if (saved) await connection.query('UPDATE payroll_bonuses SET amount=?,note=?,updated_by=?,updated_at=?,version=version+1 WHERE teacher_id=? AND month=?', [amount, note.trim(), req.user.name, now, teacherId, month]);
      else await connection.query('INSERT INTO payroll_bonuses (teacher_id,month,amount,note,updated_by,updated_at) VALUES (?,?,?,?,?,?)', [teacherId, month, amount, note.trim(), req.user.name, now]);
      await connection.commit(); res.json({ success: true });
    } catch (error) { if (connection) await connection.rollback(); next(error); }
    finally { connection?.release(); }
  });
}
