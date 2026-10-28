import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './fixture.js';
import { applyClassPayRates, readClassPayRates } from '../server/pay-rates.js';
import { freezeExistingPayroll } from '../scripts/migrate-flexible-payroll.js';

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

const rates = { session_amount: 300000, teacher_amount: 200000, ta_amount: 75000, version: 0, effective_date: '2026-10-01' };

const attendance = patch => ({ teacher_id: 1, date: '2026-10-01', start_time: '15:15', end_time: '17:15', slot: 'Thứ 5 (15:15 - 17:15)', lesson: 'Bài học', role: 'teacher', teacher_count: 1, ta_count: 0, status: 'completed', notes: '', version: 0, ...patch });

test('dated rates affect only their teaching dates, optional rates distinguish blank and zero, and confirmed pay stays frozen', async t => {
  const { request, login } = await serve(t); const admin = await login('admin');
  assert.equal((await request('/payroll/rates/1', { ...rates, no_ta_amount: 187500, solo_teacher_amount: 225000 }, admin)).status, 200);
  const first = await request('/classes/1/personal-attendance', attendance(), admin, 'POST');
  assert.equal(first.status, 200);
  assert.equal((await request('/classes/1/personal-attendance', attendance({ date: '2026-10-08', ta_count: 1 }), admin, 'POST')).status, 200);
  assert.equal((await request('/classes/1/personal-attendance', attendance({ date: '2026-10-15', single_teacher: true }), admin, 'POST')).status, 200);
  assert.equal((await request('/payroll/rates/1', { ...rates, teacher_amount: 220000, no_ta_amount: 0, version: 1, effective_date: '2026-10-08' }, admin)).status, 200);
  assert.equal((await request('/classes/1/personal-attendance', attendance({ date: '2026-10-22', status: 'draft' }), admin, 'POST')).status, 200);
  let rows = (await request('/payroll?month=2026-10', undefined, admin)).data.entries;
  assert.deepEqual(rows.map(r => r.pay_amount), [187500, 200000, 225000, 0]);
  assert.equal(rows[0].pay_frozen, true); assert.equal(rows[3].pay_frozen, false);
  assert.equal((await request(`/classes/1/personal-attendance/${first.data.id}`, attendance({ teacher_count: 2, lesson: 'Sửa ghi chú', version: 1 }), admin)).status, 200);
  rows = (await request('/payroll?month=2026-10', undefined, admin)).data.entries;
  assert.equal(rows[0].pay_amount, 187500);
  const history = (await request('/payroll/rates', undefined, admin)).data[0].pay_history;
  assert.deepEqual(history.map(r => r.effective_date), ['2026-10-01', '2026-10-08']);
  assert.equal(history[0].solo_teacher_amount, 225000);
  assert.equal(history[1].no_ta_amount, 0);
  assert.equal(history[1].solo_teacher_amount, null);
});

test('admin-only per-entry overrides require reasons, accept zero, freeze and can be removed explicitly', async t => {
  const { request, login } = await serve(t); const admin = await login('admin'), teacher = await login('gv1');
  assert.equal((await request('/classes/1/personal-attendance', attendance({ override_amount: 0, override_reason: 'Không nhận lương' }), teacher, 'POST')).status, 403);
  for (const patch of [{ override_amount: 100 }, { override_amount: -1, override_reason: 'x' }, { single_teacher: true, teacher_count: 2 }, { recalculate: 'false' }]) assert.equal((await request('/classes/1/personal-attendance', attendance(patch), admin, 'POST')).status, 400);
  const saved = await request('/classes/1/personal-attendance', attendance({ override_amount: 0, override_reason: 'Không nhận lương' }), admin, 'POST');
  assert.equal(saved.status, 200);
  let rows = (await request('/payroll?month=2026-10', undefined, teacher)).data.entries;
  assert.equal(rows[0].pay_amount, 0); assert.equal(rows[0].pay_basis, 'override');
  const path = `/classes/1/personal-attendance/${saved.data.id}`;
  assert.equal((await request(path, attendance({ lesson: 'Ghi chú', version: 1 }), teacher)).status, 200);
  assert.equal((await request(path, attendance({ override_amount: null, override_reason: '', version: 2 }), admin)).status, 400);
  assert.equal((await request(path, attendance({ override_amount: null, override_reason: '', recalculate: true, version: 2 }), admin)).status, 200);
  rows = (await request('/payroll?month=2026-10', undefined, teacher)).data.entries;
  assert.equal(rows[0].pay_amount, 187500); assert.equal(rows[0].pay_basis, 'staffing');
});

test('recalculation previews before and after, rejects changed versions or rates, and applies selected rows atomically', async t => {
  const { request, login, sqlite } = await serve(t); const admin = await login('admin'), teacher = await login('gv1');
  assert.equal((await request('/payroll/rates/1', rates, admin)).status, 200);
  const a = await request('/classes/1/personal-attendance', attendance(), admin, 'POST');
  const b = await request('/classes/1/personal-attendance', attendance({ date: '2026-10-08' }), admin, 'POST');
  assert.equal((await request('/payroll/rates/1', { ...rates, teacher_amount: 210000, version: 1 }, admin)).status, 200);
  const entries = [a.data.id, b.data.id].map(id => ({ id, version: 1 }));
  assert.equal((await request('/payroll/recalculate', { entries }, teacher, 'POST')).status, 403);
  const preview = await request('/payroll/recalculate', { entries }, admin, 'POST');
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.data.map(r => [r.before, r.after]), [[200000, 210000], [200000, 210000]]);
  const apply = { apply: true, entries: preview.data.map(r => ({ id: r.id, version: r.version, expected: r.after, rate_version: r.rate_version })) };
  assert.equal((await request('/payroll/recalculate', { ...apply, entries: apply.entries.map(r => ({ ...r, expected: 1 })) }, admin, 'POST')).status, 409);
  sqlite.exec("CREATE TRIGGER fail_recalc BEFORE INSERT ON attendance_actions WHEN NEW.action='recalculate' AND NEW.attendance_id=2 BEGIN SELECT RAISE(FAIL, 'fail'); END;");
  assert.equal((await request('/payroll/recalculate', apply, admin, 'POST')).status, 500);
  let rows = (await request('/payroll?month=2026-10', undefined, admin)).data.entries;
  assert.deepEqual(rows.map(r => r.pay_amount), [200000, 200000]);
  sqlite.exec('DROP TRIGGER fail_recalc');
  assert.equal((await request('/payroll/recalculate', apply, admin, 'POST')).status, 200);
  assert.equal((await request('/payroll/recalculate', apply, admin, 'POST')).status, 409);
  rows = (await request('/payroll?month=2026-10', undefined, admin)).data.entries;
  assert.deepEqual(rows.map(r => r.pay_amount), [210000, 210000]);
});

test('inconsistent staffing within a session is visible without inferring absent assistants from missing claims', async t => {
  const { request, login } = await serve(t); const admin = await login('admin');
  assert.equal((await request('/classes/1/personal-attendance', attendance({ teacher_count: 1, ta_count: 1 }), admin, 'POST')).status, 200);
  let rows = (await request('/payroll?month=2026-10', undefined, admin)).data.entries;
  assert.equal(rows[0].staffing_warning, '');
  assert.equal((await request('/classes/1/personal-attendance', attendance({ teacher_id: 2, teacher_count: 2 }), admin, 'POST')).status, 200);
  rows = (await request('/payroll?month=2026-10', undefined, admin)).data.entries;
  assert.ok(rows.every(r => r.staffing_warning));
});

test('migration preserves the old automatic split for confirmed work and historic sessions and is idempotent', async t => {
  const { sqlite, connection } = await serve(t);
  sqlite.exec(`INSERT INTO class_pay_rates VALUES (1,225000,150000,75000,1,'Admin','now');
    INSERT INTO personal_attendance (id,teacher_id,teacher_name,class_id,date,start_time,end_time,role,status) VALUES (1,1,'A',1,'2026-10-01','15:15','17:15','teacher','completed');
    INSERT INTO attendance_payroll VALUES (1,2,0);
    INSERT INTO teaching_sessions VALUES (1,1,'2026-10-02','15:15','17:15','completed','',1);
    INSERT INTO session_staff VALUES (1,1,1,'A','teacher',0),(2,1,2,'B','teacher',0);`);
  await freezeExistingPayroll(connection);
  assert.equal(JSON.parse(sqlite.prepare('SELECT snapshot FROM attendance_pay_details').get().snapshot).pay_rate, 112500);
  assert.equal(JSON.parse(sqlite.prepare('SELECT snapshot FROM historic_pay_snapshots LIMIT 1').get().snapshot).pay_rate, 112500);
  sqlite.exec('UPDATE class_pay_rates SET session_amount=900000');
  await freezeExistingPayroll(connection);
  assert.equal(JSON.parse(sqlite.prepare('SELECT snapshot FROM attendance_pay_details').get().snapshot).pay_rate, 112500);
});

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
  for (const patch of [{ teacher_amount: -1 }, { ta_amount: 1.5 }, { session_amount: '300000' }, { ta_amount: null }, { session_amount: 1e14 }, { no_ta_amount: -1 }, { solo_teacher_amount: '200' }, { effective_date: '2026-02-30' }, { version: -1 }]) {
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

test('correcting actual staffing recalculates existing teacher pay across APIs and keeps draft and cancelled semantics', async t => {
  const { request, login, sqlite } = await serve(t);
  const admin = await login('admin');
  const configured = { session_amount: 187500, teacher_amount: 125000, ta_amount: 62500, no_ta_amount: 187500, version: 0, effective_date: '2026-10-01' };
  assert.equal((await request('/payroll/rates/1', configured, admin)).status, 200);
  sqlite.exec(`
    INSERT INTO personal_attendance (id,teacher_id,teacher_name,class_id,date,start_time,end_time,slot,lesson,role,status,notes) VALUES
      (1,1,'A',1,'2026-10-01','15:15','17:15','Suất','Bài','teacher','completed',''),
      (2,1,'A',1,'2026-10-08','15:15','17:15','Suất','Bài','teacher','draft',''),
      (3,1,'A',1,'2026-10-15','15:15','17:15','Suất','Bài','teacher','cancelled','');
    INSERT INTO attendance_payroll VALUES (1,1,1),(2,1,0),(3,1,0);
  `);
  const body = { teacher_id: 1, date: '2026-10-01', start_time: '15:15', end_time: '17:15', slot: 'Suất', lesson: 'Bài', role: 'teacher', teacher_count: 1, ta_count: 0, status: 'completed', notes: '', version: 1, recalculate: true };
  assert.equal((await request('/classes/1/personal-attendance/1', body, admin)).status, 200);
  let data = (await request('/payroll?month=2026-10', undefined, admin)).data;
  assert.deepEqual(data.entries.map(row => row.pay_amount), [187500, 187500, 0]);
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].pay_amount, 187500);
  assert.equal((await request('/classes/1/personal-attendance', undefined, admin)).data.find(row => row.id === 1).pay_amount, 187500);
  assert.equal((await request('/classes/1/personal-attendance/1', { ...body, ta_count: 1, version: 2 }, admin)).status, 200);
  data = (await request('/payroll?month=2026-10', undefined, admin)).data;
  assert.equal(data.entries.find(row => row.id === 1).pay_amount, 125000);
  assert.equal(data.rows[0].pay_amount, 125000);
  for (const [teacher_count, ta_count, version, expected] of [[2, 1, 3, 125000], [2, 0, 4, 187500], [1, 0, 5, 187500]]) {
    assert.equal((await request('/classes/1/personal-attendance/1', { ...body, teacher_count, ta_count, version }, admin)).status, 200);
    data = (await request('/payroll?month=2026-10', undefined, admin)).data;
    assert.equal(data.entries.find(row => row.id === 1).pay_amount, expected);
    assert.equal(data.rows[0].pay_amount, expected);
    assert.equal((await request('/classes/1/personal-attendance', undefined, admin)).data.find(row => row.id === 1).pay_amount, expected);
  }
  assert.equal((await request('/payroll/rates/1', { session_amount: 225000, teacher_amount: 150000, ta_amount: 75000, no_ta_amount: 225000, version: 1, effective_date: '2026-10-01' }, admin)).status, 200);
  data = (await request('/payroll?month=2026-10', undefined, admin)).data;
  assert.equal(data.rows[0].pay_amount, 187500);
});
