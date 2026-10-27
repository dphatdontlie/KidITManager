import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { databaseConfig } from '../server/database-config.js';

const db = await mysql.createConnection({ ...databaseConfig, connectTimeout: 10000 });
try {
  await db.query(await readFile(new URL('../migrations/009-payroll-bonuses.sql', import.meta.url), 'utf8'));
  console.log('Đã tạo bảng tiền thưởng theo giáo viên và tháng. Lương theo suất hiện có được giữ nguyên.');
} finally { await db.end(); }
