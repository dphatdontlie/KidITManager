import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './fixture.js';
import { applyClassPayRates, readClassPayRates } from '../server/pay-rates.js';

async function serve(t) {
  const fixture = createFixture({ auth: true });
  const server = fixture.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fixture.sqlite.close(); });
  const request = async (path, body, cookie = '', method = body ? 'PUT' : 'GET') => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = async username => (await request('/auth/login', { username, password: username === 'admin' ? 'admin' : 'kidit' }, '', 'POST')).cookie;
  return { ...fixture, request, login };
}

const rates = { session_amount: 300000, teacher_amount: 200000, ta_amount: 75000, version: 0 };

test('existing payroll remains available before the rates migration without hiding other database failures', async () => {
  const missing = { query: async () => { throw Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' }); } };
  const rows = await applyClassPayRates(missing, [{ class_id: 1, role: 'teacher', teacher_count: 1, ta_count: 0, status: 'completed' }]);
  assert.equal(rows[0].pay_amount, 187500);
  await assert.rejects(readClassPayRates({ query: async () => { throw new Error('offline'); } }), /offline/);
});

test('class pay rates require admin, validate money and protect against stale edits and partial saves', async t => {
  const { request, login, sqlite } = await serve(t);
  const admin = await login('admin'), teacher = await login('gv1');
  assert.equal((await request('/payroll/rates')).status, 401);
  assert.equal((await request('/payroll/rates', undefined, teacher)).status, 403);
  assert.equal((await request('/payroll/rates/1', rates, teacher)).status, 403);
  for (const patch of [{ teacher_amount: -1 }, { ta_amount: 1.5 }, { session_amount: '300000' }, { ta_amount: null }, { session_amount: 1e14 }, { session_amount: 100 }, { version: -1 }]) {
    assert.equal((await request('/payroll/rates/1', { ...rates, ...patch }, admin)).status, 400);
  }
  assert.equal((await request('/payroll/rates/999', rates, admin)).status, 404);
  assert.equal((await request('/payroll/rates/1', rates, admin)).status, 200);
  assert.equal((await request('/payroll/rates/1', rates, admin)).status, 409);
  assert.equal((await request('/payroll/rates/1', { ...rates, ta_amount: 0, version: 1 }, admin)).status, 200);
  sqlite.exec("CREATE TRIGGER fail_rate BEFORE UPDATE ON class_pay_rates BEGIN SELECT RAISE(FAIL, 'rate failure'); END;");
  assert.equal((await request('/payroll/rates/1', { ...rates, version: 2 }, admin)).status, 500);
  const [saved] = (await request('/payroll/rates', undefined, admin)).data;
  assert.equal(saved.version, 2); assert.equal(saved.ta_amount, 0); assert.equal(saved.updated_by, 'Quản trị viên');
});

test('configured rates recalculate existing work by class and role across payroll and attendance APIs', async t => {
  const { request, login, sqlite } = await serve(t);
  const admin = await login('admin');
  sqlite.exec(`
    INSERT INTO classes VALUES (2,'KID 2','','','','',10);
    INSERT INTO personal_attendance (teacher_id,teacher_name,class_id,date,start_time,end_time,slot,lesson,role,status,notes) VALUES
      (1,'A',1,'2026-10-01','15:15','17:15','Suất','Bài','teacher','completed',''),
      (2,'B',1,'2026-10-01','15:15','17:15','Suất','Bài','ta','completed',''),
      (1,'A',1,'2026-10-08','15:15','17:15','Suất','Bài','teacher','draft',''),
      (1,'A',1,'2026-10-15','15:15','17:15','Suất','Bài','teacher','cancelled',''),
      (1,'A',2,'2026-10-01','10:00','12:00','Suất','Bài','teacher','completed',''),
      (1,'A',1,'2026-10-22','15:15','17:15','Suất','Bài','teacher','completed','');
    INSERT INTO attendance_payroll VALUES (1,1,1),(2,1,1),(3,2,1),(4,1,0),(5,1,0);
    INSERT INTO teaching_sessions VALUES (1,1,'2026-10-02','15:15','17:15','completed','',1);
    INSERT INTO session_staff VALUES (1,1,3,'C','teacher',0);
  `);
  let data = (await request('/payroll?month=2026-10', undefined, admin)).data;
  assert.equal(data.entries[0].pay_amount, 187500);
  assert.equal((await request('/payroll/rates/1', rates, admin)).status, 200);
  data = (await request('/payroll?month=2026-10', undefined, admin)).data;
  const byId = new Map(data.entries.map(row => [row.id, row]));
  assert.equal(byId.get(1).pay_amount, 200000);
  assert.equal(byId.get(2).pay_amount, 75000);
  assert.equal(byId.get(3).pay_amount, 200000);
  assert.equal(byId.get(4).pay_amount, 0);
  assert.equal(byId.get(5).pay_amount, 187500);
  assert.equal(byId.get(6).pay_amount, null);
  assert.equal(data.rows.find(row => row.session_id === 1).pay_amount, 200000);
  assert.equal((await request('/classes/1/personal-attendance', undefined, admin)).data.find(row => row.id === 2).pay_amount, 75000);
  assert.equal((await request('/classes', undefined, admin)).data.find(row => row.id === 1).class_pay_rate.teacher_amount, 200000);
  assert.equal((await request('/payroll/rates/1', { ...rates, teacher_amount: 210000, version: 1 }, admin)).status, 200);
  data = (await request('/payroll?month=2026-10', undefined, admin)).data;
  assert.equal(data.entries.find(row => row.id === 1).pay_amount, 210000);
});
