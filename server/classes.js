import { ATTENDANCE_START_DATE, isCalendarDate, scheduleSlots } from '../shared/class-schedule.js';
import { scheduleSnapshot } from '../shared/schedule-history.js';
import { loadScheduleHistory } from './schedule-history.js';
import { InputError } from './session-domain.js';

export function validateSlotStaff(staff, schedule) {
  if (!Array.isArray(staff)) throw new InputError('Phân công theo suất phải là danh sách.');
  const slots = scheduleSlots(schedule);
  const used = new Set();
  return staff.map(row => {
    if (!row || !slots.some(s => s.label === row.slot) || used.has(row.slot)) throw new InputError('Suất phân công không có trong lịch hoặc bị trùng.');
    used.add(row.slot);
    if (row.staff !== undefined) {
      if (!Array.isArray(row.staff) || row.staff.length > 20) throw new InputError('Mỗi suất được phân công tối đa 20 người.');
      const names = new Set();
      const people = row.staff.map(person => {
        if (!person || typeof person.name !== 'string' || !person.name.trim() || person.name.length > 255 || !['teacher', 'ta'].includes(person.role)) throw new InputError('Hãy chọn nhân sự và vai trò giáo viên hoặc trợ giảng.');
        const name = person.name.trim();
        if (names.has(name)) throw new InputError('Một người chỉ được phân công một lần trong cùng suất.');
        names.add(name);
        return { name, role: person.role };
      });
      return { slot: row.slot, teacher: people.find(p => p.role === 'teacher')?.name || '', ta: people.find(p => p.role === 'ta')?.name || '', staff: people };
    }
    for (const key of ['teacher', 'ta']) {
      if (typeof row[key] !== 'string' || row[key].length > 255) throw new InputError('Tên nhân sự không hợp lệ.');
    }
    return { slot: row.slot, teacher: row.teacher.trim(), ta: row.ta.trim() };
  });
}

export function registerClasses(app, pool) {
  const db = pool.promise();
  const loadStaff = async (connection, classId) => {
    const [staff] = await connection.query(`SELECT * FROM class_slot_staff${classId ? ' WHERE class_id=?' : ''}`, classId ? [classId] : []);
    const [people] = await connection.query(`SELECT * FROM class_slot_people${classId ? ' WHERE class_id=?' : ''} ORDER BY position`, classId ? [classId] : []);
    return staff.map(row => {
      const assigned = people.filter(p => p.class_id === row.class_id && p.slot === row.slot).map(({ name, role }) => ({ name, role }));
      return { ...row, ...(assigned.length ? { staff: assigned } : {}) };
    });
  };
  const withStaff = async rows => {
    const staff = await loadStaff(db);
    const history = await loadScheduleHistory(db);
    return rows.map(row => ({ ...row, schedule_history: history.filter(s => s.class_id === row.id), slot_staff: staff.filter(s => s.class_id === row.id).map(({ class_id: _classId, ...assignment }) => assignment) }));
  };
  app.get('/api/classes', async (req, res) => {
    const [rows] = await db.query('SELECT c.*, COUNT(cs.student_id) AS enrolledCount FROM classes c LEFT JOIN class_students cs ON c.id=cs.class_id GROUP BY c.id');
    res.json(await withStaff(rows));
  });
  app.get('/api/classes/:id', async (req, res) => {
    const [[row]] = await db.query('SELECT * FROM classes WHERE id=?', [req.params.id]);
    if (!row) throw new InputError('Không tìm thấy lớp.', 404);
    res.json((await withStaff([row]))[0]);
  });
  const save = async (req, res, next) => {
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      let current = {};
      if (req.params.id) {
        const [[row]] = await connection.query('SELECT * FROM classes WHERE id=? FOR UPDATE', [req.params.id]);
        if (!row) throw new InputError('Không tìm thấy lớp.', 404);
        current = row;
      }
      const value = { teacher: '', ta: '', schedule: '', room: '', capacity: null, ...current, ...req.body };
      for (const key of ['teacher', 'ta', 'schedule', 'room']) value[key] ??= '';
      if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 255) throw new InputError('Tên lớp không hợp lệ.');
      for (const key of ['teacher', 'ta', 'schedule', 'room']) if (typeof value[key] !== 'string' || value[key].length > 2000) throw new InputError(`Trường ${key} không hợp lệ.`);
      const capacity = value.capacity === '' || value.capacity == null ? null : Number(value.capacity);
      if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) throw new InputError('Sĩ số phải là số nguyên dương.');
      let staff;
      if (value.slot_staff !== undefined) staff = validateSlotStaff(value.slot_staff, value.schedule);
      else if (req.params.id) {
        const saved = await loadStaff(connection, req.params.id);
        staff = saved.filter(s => scheduleSlots(value.schedule).some(slot => slot.label === s.slot));
      } else staff = [];
      const effectiveDate = req.body.effective_date === undefined ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()) : req.body.effective_date;
      if (!isCalendarDate(effectiveDate) || effectiveDate < ATTENDANCE_START_DATE) throw new InputError('Ngày hiệu lực phải từ 01/10/2026 trở đi.');
      const oldStaff = req.params.id ? await loadStaff(connection, req.params.id) : [];
      const cleanStaff = rows => rows.map(row => ({ slot: row.slot, teacher: row.teacher, ta: row.ta, ...(row.staff ? { staff: row.staff } : {}) })).sort((a, b) => a.slot.localeCompare(b.slot));
      const before = scheduleSnapshot(current, cleanStaff(oldStaff));
      const after = scheduleSnapshot(value, cleanStaff(staff));
      const history = req.params.id ? await loadScheduleHistory(connection, req.params.id) : [];
      const scheduleChanged = !req.params.id || JSON.stringify(before) !== JSON.stringify(after) || req.body.effective_date !== undefined;
      if (req.params.id && scheduleChanged && !history.length) {
        await connection.query('INSERT INTO class_schedule_history (class_id,effective_date,payload) VALUES (?,?,?)', [req.params.id, ATTENDANCE_START_DATE, JSON.stringify(before)]);
      }
      if (scheduleChanged && req.params.id) {
        const latest = history.filter(row => row.effective_date > effectiveDate).at(-1);
        if (latest) { Object.assign(value, latest); staff = latest.slot_staff; }
      }
      const params = [value.name.trim(), value.teacher, value.ta, value.schedule, value.room, capacity];
      let id = req.params.id;
      if (id) await connection.query('UPDATE classes SET name=?,teacher=?,ta=?,schedule=?,room=?,capacity=? WHERE id=?', [...params, id]);
      else {
        const [result] = await connection.query('INSERT INTO classes (name,teacher,ta,schedule,room,capacity) VALUES (?,?,?,?,?,?)', params);
        id = result.insertId;
      }
      if (scheduleChanged) {
        await connection.query('DELETE FROM class_schedule_history WHERE class_id=? AND effective_date=?', [id, effectiveDate]);
        await connection.query('INSERT INTO class_schedule_history (class_id,effective_date,payload) VALUES (?,?,?)', [id, effectiveDate, JSON.stringify(after)]);
      }
      await connection.query('DELETE FROM class_slot_staff WHERE class_id=?', [id]);
      await connection.query('DELETE FROM class_slot_people WHERE class_id=?', [id]);
      for (const row of staff) {
        await connection.query('INSERT INTO class_slot_staff (class_id,slot,teacher,ta) VALUES (?,?,?,?)', [id, row.slot, row.teacher, row.ta]);
        for (const [position, person] of (row.staff || []).entries()) await connection.query('INSERT INTO class_slot_people (class_id,slot,position,name,role) VALUES (?,?,?,?,?)', [id, row.slot, position, person.name, person.role]);
      }
      await connection.commit();
      res.json(req.params.id ? { success: true } : { id });
    } catch (error) { if (connection) await connection.rollback(); next(error); }
    finally { connection?.release(); }
  };
  app.post('/api/classes', save);
  app.put('/api/classes/:id', save);
}
