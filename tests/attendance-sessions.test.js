import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './fixture.js';

async function serve(t) {
  let instant = Date.parse('2026-10-01T15:15:00+07:00');
  const f = createFixture({ auth: true, attendance: { now: () => instant } });
  f.sqlite.exec("INSERT INTO students VALUES (2,'Học sinh thứ hai','','',''); INSERT INTO class_students VALUES (2,1,2)");
  const server = f.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); f.sqlite.close(); });
  const request = async (path, body, cookie = '', method = body ? 'POST' : 'GET') => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = async username => (await request('/auth/login', { username, password: username === 'admin' ? 'admin' : 'kidit' })).cookie;
  const day = '/classes/1/attendance-sessions';
  const get = c => request(`${day}?date=2026-10-01`, null, c);
  const open = (c, start_time = '15:15', end_time = '17:15') => request(day, { date: '2026-10-01', start_time, end_time }, c);
  return { ...f, request, login, get, open, day, setTime: time => { instant = Date.parse(time); } };
}

test('opening snapshots pending students once, does not modify daily history, and is idempotent', async t => {
  const f = await serve(t); const c = await f.login('gv1');
  const before = await f.get(c); assert.equal(before.data.sessions.length, 0); assert.equal(before.data.slots[0].can_open, true);
  const first = await f.open(c); assert.equal(first.status, 200);
  assert.equal((await f.open(c)).data.id, first.data.id);
  const session = (await f.get(c)).data.sessions[0];
  assert.equal(session.entries.length, 2); assert.ok(session.entries.every(e => e.status === 'pending'));
  assert.equal(session.can_manage, true);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM attendance').get().n, 0);
  f.sqlite.exec("INSERT INTO students VALUES (3,'Học sinh thêm sau','','',''); INSERT INTO class_students VALUES (3,1,3); DELETE FROM class_students WHERE student_id=2; UPDATE students SET name='Tên mới' WHERE id=1");
  const saved = (await f.get(c)).data.sessions[0];
  assert.equal(saved.entries.length, 2); assert.equal(saved.entries[0].student_name, 'Học sinh kiểm thử');
});
test('mark, clear and close preserve pending entries, reject stale versions and require admin to reopen', async t => {
  const f = await serve(t); const c = await f.login('gv1'); const admin = await f.login('admin');
  const id = (await f.open(c)).data.id;
  const mark = (status, version, cookie = c) => f.request(`${f.day}/${id}/students/1`, { status, version }, cookie);
  assert.equal((await mark('present', 1)).status, 200);
  assert.equal((await mark('absent', 1)).status, 409);
  assert.equal((await mark('pending', 2)).status, 200);
  assert.equal((await mark('absent', 3)).status, 200);
  assert.equal((await f.request(`${f.day}/${id}/close`, { version: 1 }, c)).status, 200);
  let session = (await f.get(c)).data.sessions[0];
  assert.equal(session.state, 'closed'); assert.equal(session.entries.find(e => e.student_id === 2).status, 'pending');
  assert.equal((await mark('present', 4)).status, 409);
  assert.equal((await f.request(`${f.day}/${id}/reopen`, { version: 2 }, c)).status, 403);
  assert.equal((await f.request(`${f.day}/${id}/reopen`, { version: 2 }, admin)).status, 200);
  assert.equal((await mark('present', 4)).status, 200);
  session = (await f.get(c)).data.sessions[0]; assert.equal(session.version, 3);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM student_attendance_actions').get().n, 7);
});
test('only assigned staff/admin can open and manage; dates, slots and start/end times are enforced', async t => {
  const f = await serve(t); const c = await f.login('gv1'); const other = await f.login('admin');
  f.sqlite.exec("INSERT INTO accounts (username,password_hash,account_role,teacher_id) SELECT 'gv3',password_hash,'teacher',3 FROM accounts WHERE username='gv1'");
  const outsider = await f.login('gv3');
  assert.equal((await f.request(`${f.day}?date=2026-10-01`)).status, 401);
  assert.equal((await f.open(outsider)).status, 403);
  f.setTime('2026-10-01T15:14:59+07:00'); assert.equal((await f.open(c)).status, 409);
  f.setTime('2026-10-01T17:15:00+07:00'); assert.equal((await f.open(c)).status, 409);
  f.setTime('2026-10-01T15:15:00+07:00');
  assert.equal((await f.open(c, '15:15', '19:00')).status, 409);
  const id = (await f.open(other)).data.id;
  assert.equal((await f.request(`${f.day}/${id}/students/1`, { status: 'present', version: 1 }, outsider)).status, 403);
  assert.equal((await f.request(`${f.day}/${id}/students/99`, { status: 'present', version: 1 }, c)).status, 404);
  assert.equal((await f.request(`${f.day}/${id}/students/1`, { status: 'bad', version: 1 }, c)).status, 400);
  assert.equal((await f.request('/classes/99/attendance-sessions?date=2026-10-01', null, c)).status, 404);
  assert.equal((await f.request(`${f.day}?date=2026-02-30`, null, c)).status, 400);
});
test('two same-day slots have independent results and closed snapshots survive schedule edits', async t => {
  const f = await serve(t); const c = await f.login('gv1');
  f.sqlite.exec("UPDATE classes SET schedule='Thứ 5 (15:15 - 17:15), Thứ 5 (17:15 - 19:15)'");
  const first = (await f.open(c)).data.id;
  await f.request(`${f.day}/${first}/students/1`, { status: 'present', version: 1 }, c);
  f.setTime('2026-10-01T17:15:00+07:00');
  const second = (await f.open(c, '17:15', '19:15')).data.id;
  assert.notEqual(first, second);
  const rows = (await f.get(c)).data.sessions;
  assert.equal(rows[1].entries[0].status, 'pending');
  f.sqlite.exec("UPDATE classes SET schedule=''");
  assert.equal((await f.get(c)).data.sessions.length, 2);
});
test('opening and marking roll back when audit persistence fails', async t => {
  const f = await serve(t); const c = await f.login('gv1');
  f.sqlite.exec("CREATE TRIGGER fail_student_audit BEFORE INSERT ON student_attendance_actions BEGIN SELECT RAISE(ABORT,'audit failure'); END");
  assert.equal((await f.open(c)).status, 500);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM student_attendance_sessions').get().n, 0);
  f.sqlite.exec('DROP TRIGGER fail_student_audit');
  const id = (await f.open(c)).data.id;
  f.sqlite.exec("CREATE TRIGGER fail_student_audit BEFORE INSERT ON student_attendance_actions BEGIN SELECT RAISE(ABORT,'audit failure'); END");
  assert.equal((await f.request(`${f.day}/${id}/students/1`, { status: 'present', version: 1 }, c)).status, 500);
  assert.equal((await f.get(c)).data.sessions[0].entries[0].status, 'pending');
});
