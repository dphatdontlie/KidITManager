import mysql from 'mysql2';
import { setTimeout } from 'node:timers/promises';
import { databaseConfig } from '../server/database-config.js';
import { runPushReminders } from '../server/push-reminders.js';

const pool = mysql.createPool({ ...databaseConfig, connectionLimit: 3, connectTimeout: 10000 });
let stopped = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; });
try {
  do {
    const start = Date.now();
    try { console.log('Nhắc giờ:', await runPushReminders(pool)); }
    catch (error) { console.error('Không chạy được nhắc giờ:', error.code || error.name); }
    if (process.argv.includes('--once')) break;
    while (!stopped && Date.now() - start < 60000) await setTimeout(1000);
  } while (!stopped);
} finally { await pool.promise().end(); }
