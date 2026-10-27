import { scheduleOnDate } from '../shared/schedule-history.js';

export async function loadScheduleHistory(db, classId) {
  const [rows] = await db.query(`SELECT class_id,effective_date,payload FROM class_schedule_history${classId ? ' WHERE class_id=?' : ''} ORDER BY effective_date`, classId ? [classId] : []);
  return rows.map(row => ({ class_id: row.class_id, effective_date: row.effective_date, ...JSON.parse(row.payload) }));
}

export async function classOnDate(db, cls, date) {
  return scheduleOnDate({ ...cls, schedule_history: await loadScheduleHistory(db, cls.id) }, date);
}
