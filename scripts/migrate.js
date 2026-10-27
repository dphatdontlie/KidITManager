import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { databaseConfig } from '../server/database-config.js';
import { createTeacherAccount, hashPassword } from '../server/accounts.js';

const db = await mysql.createConnection({ ...databaseConfig, connectTimeout: 10000 });
try {
  for (const file of ['001-teaching-sessions.sql', '002-personal-accounts.sql', '003-quiz-rooms.sql', '004-class-slot-staff.sql', '005-class-slot-people.sql', '006-attendance-payroll.sql', '007-class-schedule-history.sql']) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.query(statement);
  }
  await db.beginTransaction();
  try {
    const [[admin]] = await db.query("SELECT id FROM accounts WHERE account_role='admin' ORDER BY id LIMIT 1 FOR UPDATE");
    if (!admin) await db.query("INSERT INTO accounts (username,password_hash,account_role) VALUES (?,?,'admin')", ['admin', hashPassword('admin')]);
    const [teachers] = await db.query('SELECT t.id,t.name FROM teachers t LEFT JOIN accounts a ON a.teacher_id=t.id WHERE a.id IS NULL ORDER BY t.id');
    for (const teacher of teachers) await createTeacherAccount(db, teacher.id, teacher.name);
    await db.commit();
    console.log(`Đã cập nhật cấu trúc và tạo tài khoản cho ${teachers.length} giáo viên chưa có tài khoản. Tài khoản hiện có giữ nguyên mật khẩu.`);
  } catch (error) { await db.rollback(); throw error; }
} finally { await db.end(); }
