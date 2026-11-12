import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateVAPIDKeys } from 'web-push';
import { createFixture } from './fixture.js';
import { dueReminders, runPushReminders } from '../server/push-reminders.js';

const keys = generateVAPIDKeys();
const env = { PUSH_VAPID_PUBLIC_KEY: keys.publicKey, PUSH_VAPID_PRIVATE_KEY: keys.privateKey, PUSH_VAPID_SUBJECT: 'mailto:test@example.com', CRON_SECRET: 'x'.repeat(40) };
const now = Date.parse('2026-10-01T15:00:00+07:00');
const cls = { id: 1, name: 'Lớp thử', schedule: 'Thứ 5 (15:15 - 17:15)', teacher: 'A', ta: 'B', room: 'P1' };
const teachers = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }];
const subscriptions = [1, 2, 3].map(teacher_id => ({ teacher_id, lead_minutes: 15 }));

test('reminders respect the Vietnam date, weekday, assigned teachers and chosen lead time', () => {
  assert.deepEqual(dueReminders([cls], subscriptions, teachers, now).map(j => j.teacher_id), [1, 2]);
  for (const time of [now - 1, now + 5 * 60000, now + 15 * 60000, now + 86400000]) assert.equal(dueReminders([cls], subscriptions, teachers, time).length, 0);
  assert.equal(dueReminders([cls], [{ teacher_id: 1, lead_minutes: 30 }], teachers, now - 15 * 60000).length, 1);
  assert.equal(dueReminders([cls], [{ teacher_id: 1, lead_minutes: 5 }], teachers, now).length, 0);
});
test('future history, per-slot staff and ambiguous names never notify the wrong teacher', () => {
  const history = [{ effective_date: '2026-10-01', ...cls, slot_staff: [{ slot: cls.schedule, staff: [{ name: 'C', role: 'teacher' }] }] }, { effective_date: '2026-10-02', ...cls, teacher: 'A' }];
  assert.deepEqual(dueReminders([{ ...cls, schedule_history: history }], subscriptions, teachers, now).map(j => j.teacher_id), [3]);
  assert.deepEqual(dueReminders([cls], subscriptions, [...teachers, { id: 4, name: 'A' }], now).map(j => j.teacher_id), [2]);
  assert.equal(dueReminders([{ ...cls, schedule_history: [{ effective_date: '2026-10-02', ...cls }] }], subscriptions, teachers, now).length, 0);
});
test('a reminder crosses midnight without assigning the previous weekday', () => {
  const midnight = { ...cls, schedule: 'Thứ 6 (00:10 - 01:10)' };
  const time = Date.parse('2026-10-01T23:55:00+07:00');
  assert.equal(dueReminders([midnight], subscriptions, teachers, time).length, 2);
});

function setup(t, send) {
  const f = createFixture({ auth: true, push: { env } });
  t.after(() => f.sqlite.close());
  const account = f.sqlite.prepare("SELECT id FROM accounts WHERE username='gv1'").get().id;
  const session = 'test-session';
  const endpoint = 'https://web.push.apple.com/test-device';
  const id = createHash('sha256').update(endpoint).digest('hex');
  const subscription = { endpoint, keys: { p256dh: generateVAPIDKeys().publicKey, auth: Buffer.alloc(16, 1).toString('base64url') } };
  f.sqlite.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run(session, account, '2099-01-01 00:00:00');
  f.sqlite.prepare('INSERT INTO push_subscriptions (endpoint_hash,account_id,session_hash,subscription) VALUES (?,?,?,?)').run(id, account, session, JSON.stringify(subscription));
  const options = { env, now: () => now, send: send || (async () => {}) };
  return { ...f, id, account, options };
}
test('overlapping cron calls claim each device/lesson once and record scheduler health', async t => {
  let sent = 0;
  const f = setup(t, async () => { sent++; });
  const reports = await Promise.all([runPushReminders(f.pool, f.options), runPushReminders(f.pool, f.options)]);
  assert.equal(sent, 1);
  assert.equal(reports.reduce((n, r) => n + r.sent, 0), 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM push_deliveries').get().n, 1);
  assert.ok(f.sqlite.prepare('SELECT last_run_at FROM push_scheduler').get());
});
test('expired sessions never receive reminders; transient failures can retry', async t => {
  const f = setup(t, async () => { throw new Error('offline'); });
  assert.equal((await runPushReminders(f.pool, f.options)).failed, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM push_deliveries').get().n, 0);
  assert.equal((await runPushReminders(f.pool, { ...f.options, send: async () => {} })).sent, 1);
  f.sqlite.prepare('DELETE FROM push_deliveries').run();
  f.sqlite.prepare("UPDATE account_sessions SET expires_at='2000-01-01'").run();
  assert.equal((await runPushReminders(f.pool, f.options)).sent, 0);
});
test('dead endpoints are removed and do not retry', async t => {
  const f = setup(t, async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); });
  assert.equal((await runPushReminders(f.pool, f.options)).failed, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n, 0);
});
test('preferences are account-scoped, validated, and administrators without teacher links cannot set reminders', async t => {
  const f = setup(t);
  const server = f.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const login = async username => (await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: username === 'admin' ? 'admin' : 'kidit' }) })).headers.get('set-cookie').split(';')[0];
  const cookie = await login('gv1');
  const save = (leadMinutes, c = cookie) => fetch(`${url}/push/preferences`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: c }, body: JSON.stringify({ leadMinutes }) });
  assert.equal((await save(30)).status, 200);
  assert.equal((await save(99)).status, 400);
  assert.equal((await save('15')).status, 400);
  const other = await login('gv2');
  assert.equal((await (await fetch(`${url}/push/preferences`, { headers: { Cookie: other } })).json()).leadMinutes, 15);
  assert.equal((await save(15, await login('admin'))).status, 403);
  assert.equal((await fetch(`${url}/cron/push-reminders`)).status, 401);
  assert.equal((await fetch(`${url}/cron/push-reminders`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await fetch(`${url}/cron/push-reminders`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } })).status, 200);
});
