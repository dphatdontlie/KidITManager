import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './fixture.js';
import { summarizeTeacherPayments } from '../shared/payroll.js';

async function serve(t) {
  const fixture = createFixture({ auth: true }); const server = fixture.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fixture.sqlite.close(); });
  const request = async (path, body, cookie = '', method = body ? 'PUT' : 'GET') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = async username => (await request('/auth/login', { username, password: username === 'admin' ? 'admin' : 'kidit' }, '', 'POST')).cookie;
  return { ...fixture, request, login };
}

test('payment totals include completed session wages and one monthly bonus, preserving missing salary', () => {
  const rows = summarizeTeacherPayments([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], [
    { teacherId: 1, status: 'completed', pay_amount: 187500, classId: 1 },
    { teacherId: 1, status: 'completed', pay_amount: 125000, classId: 2 },
    { teacherId: 1, status: 'completed', pay_amount: null, classId: 2 },
    { teacherId: 2, status: 'draft', pay_amount: 187500 },
    { teacherId: 2, status: 'cancelled', pay_amount: 0 },
  ], [{ teacher_id: 1, amount: 50000 }, { teacher_id: 2, amount: 10000 }]);
  assert.deepEqual(rows.map(({ id, count, salary, bonus, total, missing }) => ({ id, count, salary, bonus, total, missing })), [
    { id: 1, count: 3, salary: 312500, bonus: 50000, total: 362500, missing: 1 },
    { id: 2, count: 0, salary: 0, bonus: 10000, total: 10000, missing: 0 },
    { id: 3, count: 0, salary: 0, bonus: 0, total: 0, missing: 0 },
  ]);
});

test('only admins can read or save bonuses and totals remain separate by teacher and month', async t => {
  const { request, login } = await serve(t); const admin = await login('admin'), teacher = await login('gv1');
  const bonus = { month: '2026-10', amount: 50000, note: 'Thưởng buổi ngoại khóa', version: 0 };
  assert.equal((await request('/payroll/bonuses?month=2026-10')).status, 401);
  assert.equal((await request('/payroll/bonuses?month=2026-10', undefined, teacher)).status, 403);
  assert.equal((await request('/payroll/bonuses/1', bonus, teacher)).status, 403);
  assert.equal((await request('/payroll/bonuses/1', bonus, admin)).status, 200);
  assert.equal((await request('/payroll/bonuses/2', { ...bonus, amount: 100000 }, admin)).status, 200);
  assert.equal((await request('/payroll/bonuses/1', { ...bonus, month: '2026-11', amount: 200000 }, admin)).status, 200);
  const october = (await request('/payroll/bonuses?month=2026-10', undefined, admin)).data;
  assert.deepEqual(october.map(row => [row.teacher_id, row.amount, row.updated_by, row.version]), [[1, 50000, 'Quản trị viên', 1], [2, 100000, 'Quản trị viên', 1]]);
  assert.equal((await request('/payroll/bonuses?month=2026-11', undefined, admin)).data[0].amount, 200000);
  assert.deepEqual((await request('/payroll/bonuses?month=2026-12', undefined, admin)).data, []);
});

test('bonus validation, stale edits, zero correction and transaction failures protect stored money', async t => {
  const { request, login, sqlite } = await serve(t); const admin = await login('admin');
  const bonus = { month: '2026-10', amount: 50000, note: '', version: 0 };
  for (const patch of [{ amount: -1 }, { amount: 1.5 }, { amount: '50000' }, { amount: null }, { amount: 100000000000000 }, { note: 'x'.repeat(1001) }, { month: '2026-13' }, { version: -1 }]) assert.equal((await request('/payroll/bonuses/1', { ...bonus, ...patch }, admin)).status, 400);
  assert.equal((await request('/payroll/bonuses/999', bonus, admin)).status, 404);
  assert.equal((await request('/payroll/bonuses/1', bonus, admin)).status, 200);
  assert.equal((await request('/payroll/bonuses/1', bonus, admin)).status, 409);
  assert.equal((await request('/payroll/bonuses/1', { ...bonus, amount: 0, version: 1 }, admin)).status, 200);
  sqlite.exec("CREATE TRIGGER fail_bonus BEFORE UPDATE ON payroll_bonuses BEGIN SELECT RAISE(FAIL, 'bonus failure'); END;");
  assert.equal((await request('/payroll/bonuses/1', { ...bonus, version: 2 }, admin)).status, 500);
  const saved = sqlite.prepare('SELECT amount,version FROM payroll_bonuses WHERE teacher_id=1 AND month=?').get('2026-10');
  assert.equal(saved.amount, 0); assert.equal(saved.version, 2);
});
