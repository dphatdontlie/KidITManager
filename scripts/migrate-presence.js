import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { databaseConfig } from '../server/database-config.js';

const db = await mysql.createConnection({ ...databaseConfig, connectTimeout: 10000 });
try {
  await db.query(await readFile(new URL('../migrations/014-staff-presence.sql', import.meta.url), 'utf8'));
  console.log('Đã tạo bảng trạng thái truy cập của nhân sự.');
} finally {
  await db.end();
}
