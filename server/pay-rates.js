import { InputError } from './session-domain.js';
import { payRateOnDate, staffingWarnings, withSessionPay } from '../shared/payroll.js';
import { isCalendarDate } from '../shared/class-schedule.js';

export const normalizePayRate = row => ({ ...row, session_amount: Number(row.session_amount), teacher_amount: Number(row.teacher_amount), ta_amount: Number(row.ta_amount) });

export async function readClassPayRates(db) {
  try {
    const [rates] = await db.query('SELECT * FROM class_pay_rates ORDER BY class_id');
    const [history] = await db.query('SELECT * FROM class_pay_rate_history ORDER BY effective_date');
    return rates.map(row => {
      const pay_history = history.filter(h => h.class_id === row.class_id).map(h => ({ ...JSON.parse(h.payload), effective_date: h.effective_date }));
      return { ...normalizePayRate(row), ...pay_history.at(-1), version: row.version, pay_history };
    });
  }
  catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

export async function applyClassPayRates(db, rows) {
  if (!rows.length) return rows;
  const rates = await readClassPayRates(db);
  const byClass = new Map(rates.map(row => [row.class_id, row]));
  let details = [], historic = [];
  try {
    [details] = await db.query('SELECT * FROM attendance_pay_details');
    [historic] = await db.query('SELECT * FROM historic_pay_snapshots');
  } catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
  const personalMap = new Map(details.map(d => [d.attendance_id, d]));
  const historicMap = new Map(historic.map(d => [`${d.session_id}:${d.teacher_id}`, d]));
  return staffingWarnings(rows.map(row => {
    const detail = row.id != null ? personalMap.get(row.id) : historicMap.get(`${row.session_id}:${row.teacher_id}`);
    return withSessionPay({ ...row, single_teacher: Boolean(detail?.single_teacher), override_amount: detail?.override_amount == null ? null : Number(detail.override_amount), override_reason: detail?.override_reason || '', pay_snapshot: detail?.snapshot ? JSON.parse(detail.snapshot) : null, class_pay_rate: payRateOnDate(byClass.get(row.class_id), row.date) });
  }));
}

export function snapshotPay(row) {
  return JSON.stringify({ pay_rate: row.pay_rate, pay_basis: row.pay_basis, teacher_count: row.teacher_count, ta_count: row.ta_count, single_teacher: Boolean(row.single_teacher), class_pay_rate: row.class_pay_rate || null });
}

export const validMoney = value => Number.isSafeInteger(value) && value >= 0 && value <= 99999999999999;

export function registerPayRates(app, pool) {
  const db = pool.promise();
  app.use('/api/payroll/rates', (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Chỉ admin được cấu hình phát lương.' }));
  app.get('/api/payroll/rates', async (req, res, next) => {
    try { res.json(await readClassPayRates(db)); }
    catch (error) { next(error.code === 'ER_NO_SUCH_TABLE' ? new InputError('Cần cập nhật bảng cấu hình lương trên máy chủ trước khi sử dụng.', 503) : error); }
  });
  app.put('/api/payroll/rates/:classId', async (req, res, next) => {
    let connection;
    try {
      const classId = Number(req.params.classId);
      const { session_amount, teacher_amount, ta_amount, version, no_ta_amount = null, solo_teacher_amount = null, effective_date } = req.body || {};
      if (!Number.isSafeInteger(classId) || classId < 1 || ![session_amount, teacher_amount, ta_amount].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 99999999999999) || !Number.isSafeInteger(version) || version < 0) throw new InputError('Số tiền phải là số nguyên không âm, tối đa 99.999.999.999.999đ. Hãy tải lại nếu phiên bản không hợp lệ.');
      if (![no_ta_amount, solo_teacher_amount].every(n => n === null || validMoney(n)) || !isCalendarDate(effective_date)) throw new InputError('Ngày bắt đầu áp dụng không hợp lệ hoặc đơn giá tùy chọn phải là số nguyên không âm.');
      connection = await db.getConnection(); await connection.beginTransaction();
      const [[cls]] = await connection.query('SELECT id FROM classes WHERE id=? FOR UPDATE', [classId]);
      if (!cls) throw new InputError('Không tìm thấy lớp.', 404);
      const [[saved]] = await connection.query('SELECT * FROM class_pay_rates WHERE class_id=? FOR UPDATE', [classId]);
      if ((saved?.version || 0) !== version) throw new InputError('Cấu hình vừa thay đổi. Hãy tải lại trước khi lưu.', 409);
      if (saved) {
        const [history] = await connection.query('SELECT * FROM class_pay_rate_history WHERE class_id=?', [classId]);
        if (!history.length && effective_date > '0001-01-01') await connection.query('INSERT INTO class_pay_rate_history (class_id,effective_date,payload) VALUES (?,?,?)', [classId, '0001-01-01', JSON.stringify(normalizePayRate(saved))]);
      }
      await connection.query('DELETE FROM class_pay_rate_history WHERE class_id=? AND effective_date=?', [classId, effective_date]);
      await connection.query('INSERT INTO class_pay_rate_history (class_id,effective_date,payload) VALUES (?,?,?)', [classId, effective_date, JSON.stringify({ session_amount, teacher_amount, ta_amount, no_ta_amount, solo_teacher_amount, updated_by: req.user.name })]);
      const [[latest]] = await connection.query('SELECT * FROM class_pay_rate_history WHERE class_id=? ORDER BY effective_date DESC LIMIT 1', [classId]);
      const current = JSON.parse(latest.payload);
      const values = [current.session_amount, current.teacher_amount, current.ta_amount, req.user.name, new Date().toISOString(), classId];
      if (saved) await connection.query('UPDATE class_pay_rates SET session_amount=?,teacher_amount=?,ta_amount=?,updated_by=?,updated_at=?,version=version+1 WHERE class_id=?', values);
      else await connection.query('INSERT INTO class_pay_rates (session_amount,teacher_amount,ta_amount,updated_by,updated_at,class_id) VALUES (?,?,?,?,?,?)', values);
      await connection.commit(); res.json({ success: true });
    } catch (error) {
      if (connection) await connection.rollback();
      next(error.code === 'ER_NO_SUCH_TABLE' ? new InputError('Cần cập nhật bảng cấu hình lương trên máy chủ trước khi lưu.', 503) : error);
    }
    finally { connection?.release(); }
  });

  app.post('/api/payroll/recalculate', async (req, res, next) => {
    let connection;
    try {
      if (req.user?.role !== 'admin') throw new InputError('Chỉ admin được tính lại lương.', 403);
      const { entries, apply = false } = req.body || {};
      if (!Array.isArray(entries) || !entries.length || entries.length > 200 || typeof apply !== 'boolean' || new Set(entries.map(e => e.id)).size !== entries.length || entries.some(e => !Number.isSafeInteger(e.id) || e.id < 1 || !Number.isSafeInteger(e.version))) throw new InputError('Hãy chọn từ 1 đến 200 bản ghi hợp lệ.');
      connection = await db.getConnection(); await connection.beginTransaction();
      const results = [];
      const classIds = new Set();
      for (const selection of entries) {
        const [[row]] = await connection.query('SELECT class_id FROM personal_attendance WHERE id=?', [selection.id]);
        if (!row) throw new InputError('Không tìm thấy lượt công.', 404);
        classIds.add(row.class_id);
      }
      for (const classId of [...classIds].sort((a, b) => a - b)) await connection.query('SELECT id FROM classes WHERE id=? FOR UPDATE', [classId]);
      for (const selection of [...entries].sort((a, b) => a.id - b.id)) {
        const [[row]] = await connection.query('SELECT a.*,p.teacher_count,p.ta_count FROM personal_attendance a LEFT JOIN attendance_payroll p ON p.attendance_id=a.id WHERE a.id=? FOR UPDATE', [selection.id]);
        if (!row || row.status !== 'completed' || row.version !== selection.version) throw new InputError('Công đã thay đổi. Hãy tải lại trước khi tính lại.', 409);
        const [before] = await applyClassPayRates(connection, [row]);
        const after = withSessionPay({ ...before, pay_snapshot: null });
        if (after.pay_rate == null) throw new InputError('Cần bổ sung đội hình trước khi tính lại lương.');
        const rateVersion = (await readClassPayRates(connection)).find(r => r.class_id === row.class_id)?.version || 0;
        if (apply && (selection.expected !== after.pay_rate || selection.rate_version !== rateVersion)) throw new InputError('Đơn giá vừa thay đổi. Hãy xem lại số tiền trước khi xác nhận.', 409);
        results.push({ id: row.id, version: row.version, teacher_name: row.teacher_name, date: row.date, before: before.pay_amount, after: after.pay_amount, rate_version: rateVersion });
        if (apply) {
          await connection.query('DELETE FROM attendance_pay_details WHERE attendance_id=?', [row.id]);
          await connection.query('INSERT INTO attendance_pay_details (attendance_id,single_teacher,override_amount,override_reason,snapshot) VALUES (?,?,?,?,?)', [row.id, Number(before.single_teacher), before.override_amount, before.override_reason, snapshotPay(after)]);
          await connection.query('UPDATE personal_attendance SET version=version+1 WHERE id=?', [row.id]);
          await connection.query('INSERT INTO attendance_actions (attendance_id,actor_account_id,actor_name,action,payload) VALUES (?,?,?,?,?)', [row.id, req.user.id, req.user.name, 'recalculate', JSON.stringify({ before: before.pay_amount, after: after.pay_amount })]);
        }
      }
      await connection.commit(); res.json(results);
    } catch (error) { if (connection) await connection.rollback(); next(error); }
    finally { connection?.release(); }
  });
}
