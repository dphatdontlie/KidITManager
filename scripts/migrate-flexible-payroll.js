import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { databaseConfig } from '../server/database-config.js';
import { staffingCounts, validStaffing, sessionPay } from '../shared/payroll.js';

export async function freezeExistingPayroll(db) {
  await db.query('CREATE TABLE IF NOT EXISTS payroll_migration_state (name VARCHAR(100) PRIMARY KEY)');
  await db.beginTransaction();
  try {
    const [[done]] = await db.query("SELECT name FROM payroll_migration_state WHERE name='flexible-payroll-v1' FOR UPDATE");
    if (done) { await db.commit(); return; }
    const [rates] = await db.query('SELECT * FROM class_pay_rates');
    const byClass = new Map(rates.map(r => [r.class_id, r]));
    const oldSnapshot = row => {
      const config = byClass.get(row.class_id);
      const rate = config && validStaffing(row.teacher_count, row.ta_count, row.role)
        ? Number(row.role === 'ta' ? config.ta_amount : row.ta_count === 0 ? config.session_amount : config.teacher_amount) / (row.role === 'teacher' ? row.teacher_count : 1)
        : sessionPay(row.role, row.teacher_count, row.ta_count);
      return JSON.stringify({ pay_rate: rate, pay_basis: config ? 'class' : 'staffing', teacher_count: row.teacher_count, ta_count: row.ta_count, migrated: true });
    };
    const [entries] = await db.query("SELECT a.*,p.teacher_count,p.ta_count FROM personal_attendance a LEFT JOIN attendance_payroll p ON p.attendance_id=a.id WHERE a.status='completed' FOR UPDATE");
    for (const row of entries) {
      const [[detail]] = await db.query('SELECT * FROM attendance_pay_details WHERE attendance_id=?', [row.id]);
      if (!detail) await db.query('INSERT INTO attendance_pay_details (attendance_id,single_teacher,override_amount,override_reason,snapshot) VALUES (?,0,NULL,?,?)', [row.id, '', oldSnapshot(row)]);
    }
    const [historic] = await db.query("SELECT a.teacher_id,a.role,s.id AS session_id,s.class_id FROM session_staff a JOIN teaching_sessions s ON s.id=a.session_id WHERE s.status='completed'");
    for (const row of historic) {
      const [[saved]] = await db.query('SELECT * FROM historic_pay_snapshots WHERE session_id=? AND teacher_id=?', [row.session_id, row.teacher_id]);
      if (!saved) await db.query('INSERT INTO historic_pay_snapshots (session_id,teacher_id,snapshot) VALUES (?,?,?)', [row.session_id, row.teacher_id, oldSnapshot({ ...row, ...staffingCounts(historic.filter(p => p.session_id === row.session_id)) })]);
    }
    await db.query("INSERT INTO payroll_migration_state (name) VALUES ('flexible-payroll-v1')");
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/migrate-flexible-payroll.js')) {
  const db = await mysql.createConnection({ ...databaseConfig, connectTimeout: 10000 });
  try {
    const sql = await readFile(new URL('../migrations/011-flexible-payroll.sql', import.meta.url), 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.query(statement);
    await freezeExistingPayroll(db);
    console.log('Đã tạo cấu hình lương linh động và giữ nguyên tiền công đã xác nhận.');
  } finally { await db.end(); }
}
