import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './fixture.js';
import { usernameFromName, createTeacherAccount, hashPassword, verifyPassword } from '../server/accounts.js';
import { scheduleSlots } from '../shared/class-schedule.js';

async function serve(t) {
  const fixture = createFixture({ auth: true });
  const server = fixture.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fixture.sqlite.close(); });
  const request = async (path, body, cookie = '', method = body ? 'POST' : 'GET') => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = async (username, password = 'kidit') => (await request('/auth/login', { username, password })).cookie;
  return { ...fixture, request, login };
}
const entry = (patch = {}) => ({ date: '2026-10-01', start_time: '15:15', end_time: '17:15', slot: 'Thứ 5 (15:15 - 17:15)', lesson: 'Lập trình vòng lặp', role: 'teacher', teacher_count: 1, ta_count: 1, status: 'completed', notes: '', version: 0, ...patch });

test('dated staffing changes preserve past payroll and allow a late claim against the old schedule', async t => {
  const { request, login } = await serve(t);
  const cookie = await login('gv1');
  assert.equal((await request('/classes/1/personal-attendance', entry({ teacher_count: 2, ta_count: 0 }), cookie)).status, 200);
  const change = { effective_date: '2026-10-12', schedule: 'Thứ 2 (17:15 - 19:15)', slot_staff: [{ slot: 'Thứ 2 (17:15 - 19:15)', staff: [{ name: 'GV kiểm thử A', role: 'teacher' }, { name: 'GV kiểm thử B', role: 'ta' }] }] };
  assert.equal((await request('/classes/1', change, cookie, 'PUT')).status, 200);
  assert.equal((await request('/classes/1/personal-attendance', entry({ date: '2026-10-08', teacher_count: 2, ta_count: 0 }), cookie)).status, 200);
  assert.equal((await request('/classes/1/personal-attendance', entry({ date: '2026-10-15' }), cookie)).status, 400);
  const later = entry({ date: '2026-10-12', start_time: '17:15', end_time: '19:15', slot: 'Thứ 2 (17:15 - 19:15)' });
  assert.equal((await request('/classes/1/personal-attendance', later, cookie)).status, 200);
  const report = (await request('/payroll?month=2026-10', undefined, cookie)).data;
  assert.deepEqual(report.entries.map(row => [row.date, row.teacher_count, row.ta_count, row.pay_amount]), [
    ['2026-10-01', 2, 0, 187500], ['2026-10-08', 2, 0, 187500], ['2026-10-12', 1, 1, 125000],
  ]);
});

test('API preserves confirmed salary across staffing edits and ignores client-supplied money', async t => {
  const { request, login } = await serve(t);
  const cookie = await login('gv1');
  const saved = await request('/classes/1/personal-attendance', entry(), cookie);
  const path = `/classes/1/personal-attendance/${saved.data.id}`;
  let version = 1;
  for (const [teacher_count, ta_count, expected] of [[1, 0, 125000], [2, 0, 125000], [1, 1, 125000], [2, 1, 125000]]) {
    assert.equal((await request(path, entry({ teacher_count, ta_count, pay_amount: 999999999, pay_rate: 999999999, version: version++ }), cookie, 'PUT')).status, 200);
    assert.equal((await request('/payroll?month=2026-10', null, cookie)).data.rows[0].pay_amount, expected);
  }
  assert.equal((await request(path, entry({ status: 'cancelled', version: version++ }), cookie, 'PUT')).status, 200);
  const report = (await request('/payroll?month=2026-10', null, cookie)).data;
  assert.equal(report.rows.length, 0);
  assert.equal(report.entries[0].pay_amount, 0);
  for (const patch of [{ teacher_count: '2' }, { teacher_count: 1.5 }, { teacher_count: null }, { teacher_count: 20, ta_count: 1 }, { role: 'ta', ta_count: 0 }]) assert.equal((await request(path, entry({ version, ...patch }), cookie, 'PUT')).status, 400);
});

test('a salary snapshot failure rolls back both new attendance and edits', async t => {
  const { request, login, sqlite, state } = await serve(t);
  const cookie = await login('gv1');
  state.failPayroll = true;
  assert.equal((await request('/classes/1/personal-attendance', entry(), cookie)).status, 500);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM personal_attendance').get().n, 0);
  state.failPayroll = false;
  const saved = await request('/classes/1/personal-attendance', entry(), cookie);
  state.failPayroll = true;
  assert.equal((await request(`/classes/1/personal-attendance/${saved.data.id}`, entry({ teacher_count: 2, lesson: 'Must roll back', version: 1 }), cookie, 'PUT')).status, 500);
  const report = (await request('/payroll?month=2026-10', null, cookie)).data;
  assert.equal(report.rows[0].pay_amount, 125000);
  assert.equal(report.rows[0].version, 1);
  assert.equal(report.rows[0].lesson, 'Lập trình vòng lặp');
});

test('payroll snapshots actual staffing, separates drafts, keeps missing historic data explicit', async t => {
  const { request, login, sqlite } = await serve(t);
  const cookie = await login('gv1');
  const saved = await request('/classes/1/personal-attendance', entry({ teacher_count: 2 }), cookie);
  assert.equal(saved.status, 200);
  let report = (await request('/payroll?month=2026-10', null, cookie)).data;
  assert.equal(report.rows[0].pay_amount, 187500);
  sqlite.prepare('UPDATE classes SET ta=? WHERE id=1').run('');
  assert.equal((await request('/payroll?month=2026-10', null, cookie)).data.rows[0].pay_amount, 187500);
  const path = `/classes/1/personal-attendance/${saved.data.id}`;
  assert.equal((await request(path, entry({ status: 'draft', version: 1 }), cookie, 'PUT')).status, 200);
  report = (await request('/payroll?month=2026-10', null, cookie)).data;
  assert.equal(report.rows.length, 0);
  assert.equal(report.entries[0].pay_amount, 125000);
  assert.equal((await request('/classes/1/personal-attendance', entry({ date: '2026-10-08', teacher_count: 0 }), cookie)).status, 400);
  sqlite.exec('DELETE FROM attendance_payroll');
  assert.equal((await request('/payroll?month=2026-10', null, cookie)).data.entries[0].pay_amount, null);
});

test('delete checks ownership and version, removes salary, and allows correcting the same shift', async t => {
  const { request, login, sqlite } = await serve(t);
  const a = await login('gv1'), b = await login('gv2'), admin = await login('admin', 'admin');
  const saved = await request('/classes/1/personal-attendance', entry(), a);
  const other = await request('/classes/1/personal-attendance', entry({ role: 'ta' }), b);
  const path = `/classes/1/personal-attendance/${saved.data.id}`;
  assert.equal((await request(path, { version: 1 }, '', 'DELETE')).status, 401);
  assert.equal((await request(path, { version: 1 }, b, 'DELETE')).status, 403);
  assert.equal((await request(path, { version: 1 }, admin, 'DELETE')).status, 403);
  assert.equal((await request(path, {}, a, 'DELETE')).status, 400);
  assert.equal((await request('/classes/2/personal-attendance/'+saved.data.id, { version: 1 }, a, 'DELETE')).status, 404);
  assert.equal((await request(path, entry({ version: 1 }), a, 'PUT')).status, 200);
  assert.equal((await request(path, { version: 1 }, a, 'DELETE')).status, 409);
  assert.equal((await request(path, { version: 2 }, a, 'DELETE')).status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM attendance_payroll WHERE attendance_id=?').get(saved.data.id).n, 0);
  const report = (await request('/payroll?month=2026-10', null, a)).data;
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].id, other.data.id);
  assert.equal(report.rows[0].pay_amount, 62500);
  assert.equal((await request(path, { version: 2 }, a, 'DELETE')).status, 404);
  assert.equal((await request('/classes/1/personal-attendance', entry(), a)).status, 200);
});

test('Vietnamese login names, salted password hashes and schedule choices', async () => {
  assert.equal(usernameFromName('Nguyễn Đăng Phát'), 'nguyendangphat');
  assert.equal(usernameFromName('  ĐỖ THỊ ÁNH  '), 'dothianh');
  const hash = hashPassword('kidit');
  assert.ok(verifyPassword('kidit', hash)); assert.equal(verifyPassword('wrong', hash), false); assert.notEqual(hash, hashPassword('kidit'));
  assert.deepEqual(scheduleSlots('Thứ 5 (15:15 - 17:15), Thứ 5 (18:00 - 19:00), Thứ 6 (09:00 - 10:00)', '2026-10-01').map(s => s.start_time), ['15:15', '18:00']);
});

test('two teachers claim the same shift independently, cannot edit each other, report is shared', async t => {
  const { request, login, sqlite } = await serve(t);
  assert.equal((await request('/classes')).status, 401);
  assert.equal((await request('/auth/login', { username: 'gv1', password: 'wrong' })).status, 401);
  const a = await login('gv1'), b = await login('gv2');
  assert.equal((await request('/classes/1/sessions', entry(), a)).status, 410);
  const first = await request('/classes/1/personal-attendance', entry({ teacher_id: 2, staff: [{ teacher_id: 2, role: 'teacher' }] }), a);
  assert.equal(first.status, 200); assert.equal(sqlite.prepare('SELECT teacher_id FROM personal_attendance').get().teacher_id, 1);
  assert.equal((await request('/classes/1/personal-attendance', entry({ role: 'ta' }), b)).status, 200);
  assert.equal((await request('/classes/1/personal-attendance', entry(), a)).status, 409);
  assert.equal((await request(`/classes/1/personal-attendance/${first.data.id}`, entry({ version: 1 }), b, 'PUT')).status, 403);
  const report = await request('/payroll?month=2026-10', null, a);
  assert.equal(report.data.rows.length, 2); assert.ok(report.data.rows.every(r => r.lesson === 'Lập trình vòng lặp'));
  const cancelled = await request(`/classes/1/personal-attendance/${first.data.id}`, entry({ status: 'cancelled', version: 1 }), a, 'PUT');
  assert.equal(cancelled.status, 200);
  assert.equal((await request(`/classes/1/personal-attendance/${first.data.id}`, entry({ version: 1 }), a, 'PUT')).status, 409);
  assert.equal((await request('/payroll?month=2026-10', null, b)).data.rows.length, 1);
  assert.equal((await request('/classes', null, a)).status, 200);
});

test('schedule validation, lesson, future confirmation, legacy duplicates and admin cannot claim', async t => {
  const { request, login, sqlite } = await serve(t); const a = await login('gv1');
  for (const patch of [{ lesson: '' }, { slot: 'Tự nhập' }, { start_time: '15:00' }, { date: '2026-10-02' }, { date: '2099-01-01' }]) {
    assert.equal((await request('/classes/1/personal-attendance', entry(patch), a)).status, 400);
  }
  const admin = await login('admin', 'admin');
  assert.equal((await request('/classes/1/personal-attendance', entry(), admin)).status, 403);
  sqlite.exec("INSERT INTO teaching_sessions (id,class_id,date,start_time,end_time,status,notes) VALUES (1,1,'2026-10-01','15:15','17:15','completed',''); INSERT INTO session_staff (session_id,teacher_id,teacher_name,role,minutes) VALUES (1,1,'GV kiểm thử A','teacher',0)");
  assert.equal((await request('/classes/1/personal-attendance', entry(), a)).status, 409);
  assert.equal((await request('/payroll?month=2026-10', null, a)).data.rows.length, 1);
});

test('admin creates teacher accounts, changes login and password, invalidates sessions', async t => {
  const { request, login, sqlite } = await serve(t);
  const admin = await login('admin', 'admin'), teacher = await login('gv1');
  assert.equal((await request('/accounts', null, teacher)).status, 403);
  assert.equal((await request('/accounts/2', { username: 'changed', password: 'changed' }, teacher, 'PUT')).status, 403);
  assert.equal((await request('/accounts/2', { username: 'teacherone', password: '' }, admin, 'PUT')).status, 200);
  assert.equal((await request('/auth/me', null, teacher)).data.username, 'teacherone');
  assert.ok(await login('teacherone'));
  assert.equal((await request('/accounts', { name: 'Nguyễn Đăng Phát', username: 'nguyendangphat', password: 'kidit' }, teacher)).status, 403);
  const created = await request('/accounts', { name: 'Nguyễn Đăng Phát', username: 'nguyendangphat', password: 'kidit' }, admin);
  assert.equal(created.status, 200);
  const account = sqlite.prepare("SELECT * FROM accounts WHERE username='nguyendangphat'").get();
  assert.ok(account.teacher_id); assert.ok(verifyPassword('kidit', account.password_hash));
  const oldCookie = await login('nguyendangphat');
  assert.equal((await request(`/accounts/${account.id}`, { username: 'phat', password: 'newpass' }, admin, 'PUT')).status, 200);
  assert.equal((await request('/auth/me', null, oldCookie)).status, 401);
  assert.equal((await request('/auth/login', { username: 'nguyendangphat', password: 'kidit' })).status, 401);
  const newCookie = await login('phat', 'newpass'); assert.ok(newCookie);
  assert.equal((await request('/auth/logout', {}, newCookie)).status, 200);
  assert.equal((await request('/auth/me', null, newCookie)).status, 401);
  assert.equal((await request('/accounts', { name: 'Trùng tên', username: 'phat' }, admin)).status, 409);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM teachers WHERE name='Trùng tên'").get().n, 0);
});

test('own historic slot stays editable after schedule changes, other dates use the new schedule', async t => {
  const { request, login, sqlite } = await serve(t); const cookie = await login('gv1');
  const saved = await request('/classes/1/personal-attendance', entry(), cookie);
  sqlite.prepare('UPDATE classes SET schedule=? WHERE id=1').run('Thứ 5 (18:00 - 19:00)');
  const path = `/classes/1/personal-attendance/${saved.data.id}`;
  assert.equal((await request(path, entry({ lesson: 'Bài học cập nhật', version: 1 }), cookie, 'PUT')).status, 200);
  assert.equal((await request(path, entry({ date: '2026-10-08', version: 2 }), cookie, 'PUT')).status, 400);
  assert.equal(sqlite.prepare('SELECT lesson FROM personal_attendance').get().lesson, 'Bài học cập nhật');
});

test('automatic accounts disambiguate matching names and default to kidit', async () => {
  const rows = new Map();
  const connection = { async query(sql, params) {
    if (sql.startsWith('SELECT')) return [[...(rows.has(params[0]) ? [{ id: 1 }] : [])]];
    rows.set(params[0], params[1]); return [{}];
  } };
  assert.equal(await createTeacherAccount(connection, 1, 'Nguyễn Đăng Phát'), 'nguyendangphat');
  assert.equal(await createTeacherAccount(connection, 2, 'Nguyễn Đăng Phát'), 'nguyendangphat2');
  assert.ok(verifyPassword('kidit', rows.get('nguyendangphat2')));
});
