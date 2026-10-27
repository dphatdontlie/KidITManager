import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { databaseConfig } from '../server/database-config.js';

const db = await mysql.createConnection({ ...databaseConfig, connectTimeout: 10000 });
try {
  const sql = await readFile(new URL('../migrations/008-class-notes-admin.sql', import.meta.url), 'utf8');
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.query(statement);
  console.log('Đã tạo bảng ghi chú lớp và lịch sử chấm công hộ. Dữ liệu hiện có được giữ nguyên.');
} finally { await db.end(); }
