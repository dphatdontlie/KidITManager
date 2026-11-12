import { createHash, timingSafeEqual } from 'node:crypto';
import * as webpush from 'web-push';
import { scheduleSlots } from '../shared/class-schedule.js';
import { slotPeople } from '../shared/class-staff.js';
import { scheduleOnDate } from '../shared/schedule-history.js';
import { loadScheduleHistory } from './schedule-history.js';
import { pushConfig, validateSubscription } from './push.js';

const normalize = value => String(value || '').normalize('NFC').trim().toLocaleLowerCase('vi');
const dateAt = time => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(time));

export function dueReminders(classes, subscriptions, teachers, now) {
  const dates = [...new Set([dateAt(now), dateAt(now + 30 * 60000)])];
  const matchingTeacher = name => {
    const matches = teachers.filter(t => normalize(t.name) === normalize(name));
    if (matches.length === 1) return matches[0].id;
    if (!matches.length && /^\d+$/.test(name)) return teachers.find(t => String(t.id) === name)?.id;
    return null; // Ambiguous names must not send another teacher's class details.
  };
  const jobs = [];
  for (const date of dates) for (const cls of classes) {
    const version = scheduleOnDate(cls, date);
    for (const slot of scheduleSlots(version.schedule, date)) {
      const start = Date.parse(`${date}T${slot.start_time}:00+07:00`);
      if (start <= now) continue;
      const people = slotPeople(version.slot_staff?.find(s => s.slot === slot.label) || version);
      const assigned = new Set(people.flatMap(p => String(p.name).split(/[,;\n]/).map(name => matchingTeacher(name.trim()))).filter(Boolean));
      for (const sub of subscriptions) {
        const lead = Number(sub.lead_minutes ?? 15);
        if (![5, 15, 30].includes(lead) || !assigned.has(sub.teacher_id)) continue;
        const due = start - lead * 60000;
        // Catch up a missed minute, but never send old reminders or send after class starts.
        if (now < due || now - due >= 5 * 60000) continue;
        jobs.push({ ...sub, eventKey: `${cls.id}:${date}:${slot.start_time}`, start,
          payload: { title: 'Sắp đến giờ dạy', body: `${String(cls.name).slice(0, 120)} bắt đầu lúc ${slot.start_time}${version.room ? ` · ${String(version.room).slice(0, 80)}` : ''}.`, url: `/classes/${cls.id}`, tag: `kidit-${cls.id}-${date}-${slot.start_time}` } });
      }
    }
  }
  return jobs.sort((a, b) => a.start - b.start);
}

export async function runPushReminders(pool, { env = process.env, now = Date.now, send = (...args) => webpush.sendNotification(...args) } = {}) {
  const config = pushConfig(env);
  if (!config) throw Object.assign(new Error('Chưa cấu hình khóa Web Push.'), { status: 503 });
  const db = pool.promise();
  const instant = now();
  const [subscriptions] = await db.query(`SELECT p.*,a.teacher_id,t.name,COALESCE(f.lead_minutes,15) AS lead_minutes
    FROM push_subscriptions p JOIN accounts a ON a.id=p.account_id JOIN teachers t ON t.id=a.teacher_id
    JOIN account_sessions s ON s.token_hash=p.session_hash AND s.account_id=p.account_id
    LEFT JOIN push_preferences f ON f.account_id=p.account_id WHERE s.expires_at>CURRENT_TIMESTAMP`);
  const [classes] = await db.query('SELECT * FROM classes');
  const [staff] = await db.query('SELECT * FROM class_slot_staff');
  const [people] = await db.query('SELECT * FROM class_slot_people ORDER BY position');
  const [teachers] = await db.query('SELECT id,name FROM teachers');
  const history = await loadScheduleHistory(db);
  const resolved = classes.map(cls => ({ ...cls, schedule_history: history.filter(h => h.class_id === cls.id),
    slot_staff: staff.filter(s => s.class_id === cls.id).map(s => {
      const list = people.filter(p => p.class_id === cls.id && p.slot === s.slot);
      return { ...s, ...(list.length ? { staff: list } : {}) };
    }) }));
  const jobs = dueReminders(resolved, subscriptions, teachers, instant);
  const result = { sent: 0, failed: 0, skipped: 0 };
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length && now() - instant < 40000) {
      const job = jobs[cursor++];
      if (job.start <= now()) { result.skipped++; continue; }
      const [claim] = await db.query('INSERT IGNORE INTO push_deliveries (endpoint_hash,event_key) VALUES (?,?)', [job.endpoint_hash, job.eventKey]);
      if (!claim.affectedRows) { result.skipped++; continue; }
      try {
        // Recheck ownership immediately before sending in case the device logged out or switched accounts.
        const [[active]] = await db.query(`SELECT p.endpoint_hash FROM push_subscriptions p JOIN account_sessions s ON s.token_hash=p.session_hash
          WHERE p.endpoint_hash=? AND p.account_id=? AND p.session_hash=? AND s.expires_at>CURRENT_TIMESTAMP`, [job.endpoint_hash, job.account_id, job.session_hash]);
        if (!active) { result.skipped++; continue; }
        await send(validateSubscription(JSON.parse(job.subscription)), JSON.stringify(job.payload), {
          vapidDetails: config, TTL: Math.max(1, Math.floor((job.start - now()) / 1000)), timeout: 8000,
        });
        result.sent++;
      } catch (error) {
        result.failed++;
        if ([404, 410].includes(error.statusCode)) {
          await db.query('DELETE FROM push_subscriptions WHERE endpoint_hash=? AND account_id=? AND session_hash=?', [job.endpoint_hash, job.account_id, job.session_hash]);
        } else {
          await db.query('DELETE FROM push_deliveries WHERE endpoint_hash=? AND event_key=?', [job.endpoint_hash, job.eventKey]);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, worker));
  await db.query('DELETE FROM push_deliveries WHERE created_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY)');
  await db.query('INSERT INTO push_scheduler (id,last_run_at) VALUES (1,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE last_run_at=CURRENT_TIMESTAMP');
  return { ...result, pending: Math.max(0, jobs.length - cursor) };
}

export function registerPushCron(app, pool, options = {}) {
  const env = options.env || process.env;
  app.get('/api/cron/push-reminders', async (req, res, next) => {
    const secret = env.CRON_SECRET;
    const digest = value => createHash('sha256').update(value).digest();
    if (!secret || secret.length < 32 || !timingSafeEqual(digest(req.headers.authorization || ''), digest(`Bearer ${secret}`))) {
      return res.status(401).json({ error: 'Không có quyền chạy lịch nhắc.' });
    }
    try { res.json(await runPushReminders(pool, options)); } catch (error) { next(error); }
  });
}
