import { isCalendarDate } from '../shared/class-schedule.js';
import { InputError, monthRange } from './session-domain.js';

export function registerClassNotes(app, pool) {
  const db = pool.promise();
  app.get('/api/class-notes', async (req, res, next) => {
    try {
      const [from, to] = monthRange(req.query.month);
      const classId = Number(req.query.class_id);
      if (req.user?.role !== 'admin' && !Number.isSafeInteger(classId)) throw new InputError('Chọn lớp để xem ghi chú.', 403);
      if (req.query.class_id !== undefined && (!Number.isSafeInteger(classId) || classId < 1)) throw new InputError('Lớp không hợp lệ.');
      const [rows] = await db.query(`SELECT n.*,c.name AS class_name FROM class_notes n JOIN classes c ON c.id=n.class_id WHERE n.date>=? AND n.date<?${classId ? ' AND n.class_id=?' : ''} ORDER BY n.date DESC,n.id DESC`, classId ? [from, to, classId] : [from, to]);
      res.json(rows.map(row => ({ ...row, amount: row.amount == null ? null : Number(row.amount) })));
    } catch (error) { next(error); }
  });
  const save = async (req, res, next) => {
    let connection;
    try {
      const { class_id, date, category, content, amount, status = 'open', version } = req.body || {};
      if (!Number.isSafeInteger(Number(class_id)) || Number(class_id) < 1 || !isCalendarDate(date) || !['teaching', 'expense', 'other'].includes(category) || typeof content !== 'string' || !content.trim() || content.length > 10000 || !['open', 'done'].includes(status)) throw new InputError('Hãy nhập lớp, ngày, loại và nội dung ghi chú hợp lệ (tối đa 10.000 ký tự).');
      const cost = category === 'expense' && amount !== '' && amount != null ? Number(amount) : null;
      if (cost !== null && (!Number.isSafeInteger(cost) || cost < 0 || cost > 99999999999999)) throw new InputError('Chi phí phải là số tiền nguyên, không âm.');
      connection = await db.getConnection(); await connection.beginTransaction();
      const [[cls]] = await connection.query('SELECT id FROM classes WHERE id=? FOR UPDATE', [class_id]);
      if (!cls) throw new InputError('Không tìm thấy lớp.', 404);
      let existing;
      if (req.params.noteId) {
        [[existing]] = await connection.query('SELECT * FROM class_notes WHERE id=? FOR UPDATE', [req.params.noteId]);
        if (!existing) throw new InputError('Không tìm thấy ghi chú.', 404);
        if (existing.author_account_id !== req.user.id && req.user.role !== 'admin') throw new InputError('Bạn chỉ được sửa ghi chú của mình.', 403);
        if (existing.version !== version) throw new InputError('Ghi chú vừa được sửa. Hãy cập nhật danh sách trước khi lưu.', 409);
        if (existing.class_id !== Number(class_id)) throw new InputError('Không chuyển ghi chú sang lớp khác.');
      }
      const now = new Date().toISOString();
      let id = existing?.id;
      if (existing) await connection.query('UPDATE class_notes SET date=?,category=?,content=?,amount=?,status=?,updated_by=?,updated_at=?,version=version+1 WHERE id=?', [date, category, content.trim(), cost, status, req.user.name, now, id]);
      else {
        const [saved] = await connection.query('INSERT INTO class_notes (class_id,date,category,content,amount,status,author_account_id,author_name,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [class_id, date, category, content.trim(), cost, status, req.user.id, req.user.name, req.user.name, now, now]);
        id = saved.insertId;
      }
      await connection.commit(); res.json({ id, success: true });
    } catch (error) { if (connection) await connection.rollback(); next(error); }
    finally { connection?.release(); }
  };
  app.post('/api/class-notes', save);
  app.put('/api/class-notes/:noteId', save);
}
