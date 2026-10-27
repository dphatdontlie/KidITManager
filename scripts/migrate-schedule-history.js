import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { databaseConfig } from '../server/database-config.js';

const db = await mysql.createConnection({ ...databaseConfig, connectTimeout: 10000 });
try {
  const sql = await readFile(new URL('../migrations/007-class-schedule-history.sql', import.meta.url), 'utf8');
  await db.query(sql);
  console.log('Đã tạo bảng lịch sử thời khóa biểu. Lịch, công và lương hiện có được giữ nguyên.');
} finally { await db.end(); }
