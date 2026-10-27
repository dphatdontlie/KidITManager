import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './fixture.js';

async function serve(t) {
  const fixture = createFixture({ auth: true }); const server = fixture.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fixture.sqlite.close(); });
  const request = async (path, body, cookie = '', method = body ? 'POST' : 'GET') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = async username => (await request('/auth/login', { username, password: username === 'admin' ? 'admin' : 'kidit' })).cookie;
  return { ...fixture, request, login };
}

const note = patch => ({ class_id: 1, date: '2026-10-08', category: 'expense', content: 'Mua vật liệu cho buổi Scratch\nGiữ lại phần dư cho buổi sau.', amount: 75000, status: 'open', ...patch });
const work = patch => ({ teacher_id: 2, date: '2026-10-08', start_time: '15:15', end_time: '17:15', slot: 'Thứ 5 (15:15 - 17:15)', lesson: 'Bài kiểm thử', role: 'teacher', teacher_count: 2, ta_count: 0, status: 'completed', notes: '', version: 0, ...patch });

test('class notes preserve author, costs, multiline content and enforce ownership and versions', async t => {
  const { request, login } = await serve(t); const a = await login('gv1'), b = await login('gv2'), admin = await login('admin');
  assert.equal((await request('/class-notes?month=2026-10&class_id=1')).status, 401);
  assert.equal((await request('/class-notes?month=2026-10', undefined, a)).status, 403);
  const saved = await request('/class-notes', note({ author_name: 'Giả mạo', author_account_id: 999 }), a);
  assert.equal(saved.status, 200);
  const rows = (await request('/class-notes?month=2026-10&class_id=1', undefined, b)).data;
  assert.equal(rows.length, 1); assert.equal(rows[0].author_name, 'GV kiểm thử A'); assert.equal(rows[0].amount, 75000); assert.match(rows[0].content, /\n/);
  assert.equal((await request(`/class-notes/${saved.data.id}`, note({ version: 1 }), b, 'PUT')).status, 403);
  assert.equal((await request(`/class-notes/${saved.data.id}`, note({ version: 1, status: 'done', content: 'Đã đối chiếu chi tiêu' }), admin, 'PUT')).status, 200);
  assert.equal((await request(`/class-notes/${saved.data.id}`, note({ version: 1 }), a, 'PUT')).status, 409);
  const updated = (await request('/class-notes?month=2026-10', undefined, admin)).data[0];
  assert.equal(updated.author_name, 'GV kiểm thử A'); assert.equal(updated.updated_by, 'Quản trị viên'); assert.equal(updated.version, 2); assert.equal(updated.status, 'done');
  for (const patch of [{ date: '2026-02-30' }, { class_id: 999 }, { amount: -1 }, { content: ' ' }, { content: 'x'.repeat(10001) }, { status: 'unknown' }, { category: 'salary' }]) assert.ok((await request('/class-notes', note(patch), a)).status >= 400);
  assert.deepEqual((await request('/class-notes?month=2026-11', undefined, admin)).data, []);
});

test('admins record and correct any teacher while conflicts, payroll and audit remain atomic', async t => {
  const { request, login, sqlite } = await serve(t); const admin = await login('admin');
  const saved = await request('/classes/1/personal-attendance', work(), admin);
  assert.equal(saved.status, 200);
  assert.equal(sqlite.prepare('SELECT teacher_id FROM personal_attendance').get().teacher_id, 2);
  assert.equal(sqlite.prepare('SELECT action FROM attendance_actions').get().action, 'create');
  assert.equal((await request('/classes/1/personal-attendance', work(), admin)).status, 409);
  const path = `/classes/1/personal-attendance/${saved.data.id}`;
  assert.equal((await request(path, work({ version: 1, teacher_count: 1, ta_count: 1 }), admin, 'PUT')).status, 200);
  assert.equal(JSON.parse(sqlite.prepare('SELECT payload FROM attendance_actions ORDER BY id DESC LIMIT 1').get().payload).before.teacher_count, 2);
  assert.equal((await request(path, work({ version: 1 }), admin, 'PUT')).status, 409);
  const report = (await request('/payroll?month=2026-10', undefined, admin)).data;
  assert.equal(report.entries[0].pay_amount, 125000); assert.equal(report.entries[0].recorded_by, 'Quản trị viên');
  assert.equal((await request('/classes/1/personal-attendance', work({ teacher_id: 999 }), admin)).status, 404);
  sqlite.exec("CREATE TRIGGER fail_admin_audit BEFORE INSERT ON attendance_actions BEGIN SELECT RAISE(FAIL, 'audit failure'); END;");
  assert.equal((await request('/classes/1/personal-attendance', work({ teacher_id: 3 }), admin)).status, 500);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM personal_attendance').get().n, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM attendance_payroll').get().n, 1);
});
