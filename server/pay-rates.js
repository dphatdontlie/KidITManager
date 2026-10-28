import { InputError } from './session-domain.js';
import { withSessionPay } from '../shared/payroll.js';

export const normalizePayRate = row => ({ ...row, session_amount: Number(row.session_amount), teacher_amount: Number(row.teacher_amount), ta_amount: Number(row.ta_amount) });

export async function readClassPayRates(db) {
  try { return (await db.query('SELECT * FROM class_pay_rates ORDER BY class_id'))[0].map(normalizePayRate); }
  catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

export async function applyClassPayRates(db, rows) {
  if (!rows.length) return rows;
  const rates = await readClassPayRates(db);
  const byClass = new Map(rates.map(row => [row.class_id, row]));
  return rows.map(row => withSessionPay({ ...row, class_pay_rate: byClass.get(row.class_id) || null }));
}

export function registerPayRates(app, pool) {
  const db = pool.promise();
  app.use('/api/payroll/rates', (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Chỉ admin được cấu hình phát lương.' }));
  app.get('/api/payroll/rates', async (req, res, next) => {
    try { res.json((await db.query('SELECT * FROM class_pay_rates ORDER BY class_id'))[0].map(normalizePayRate)); }
    catch (error) { next(error.code === 'ER_NO_SUCH_TABLE' ? new InputError('Cần cập nhật bảng cấu hình lương trên máy chủ trước khi sử dụng.', 503) : error); }
  });
  app.put('/api/payroll/rates/:classId', async (req, res, next) => {
    let connection;
    try {
      const classId = Number(req.params.classId);
      const { session_amount, teacher_amount, ta_amount, version } = req.body || {};
      if (!Number.isSafeInteger(classId) || classId < 1 || ![session_amount, teacher_amount, ta_amount].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 99999999999999) || !Number.isSafeInteger(version) || version < 0) throw new InputError('Số tiền phải là số nguyên không âm, tối đa 99.999.999.999.999đ. Hãy tải lại nếu phiên bản không hợp lệ.');
      if (teacher_amount + ta_amount > session_amount) throw new InputError('Tiền giáo viên và trợ giảng của đội hình 1 + 1 không được vượt tiền mỗi suất.');
      connection = await db.getConnection(); await connection.beginTransaction();
      const [[cls]] = await connection.query('SELECT id FROM classes WHERE id=? FOR UPDATE', [classId]);
      if (!cls) throw new InputError('Không tìm thấy lớp.', 404);
      const [[saved]] = await connection.query('SELECT * FROM class_pay_rates WHERE class_id=? FOR UPDATE', [classId]);
      if ((saved?.version || 0) !== version) throw new InputError('Cấu hình vừa thay đổi. Hãy tải lại trước khi lưu.', 409);
      const values = [session_amount, teacher_amount, ta_amount, req.user.name, new Date().toISOString(), classId];
      if (saved) await connection.query('UPDATE class_pay_rates SET session_amount=?,teacher_amount=?,ta_amount=?,updated_by=?,updated_at=?,version=version+1 WHERE class_id=?', values);
      else await connection.query('INSERT INTO class_pay_rates (session_amount,teacher_amount,ta_amount,updated_by,updated_at,class_id) VALUES (?,?,?,?,?,?)', values);
      await connection.commit(); res.json({ success: true });
    } catch (error) {
      if (connection) await connection.rollback();
      next(error.code === 'ER_NO_SUCH_TABLE' ? new InputError('Cần cập nhật bảng cấu hình lương trên máy chủ trước khi lưu.', 503) : error);
    }
    finally { connection?.release(); }
  });
}
