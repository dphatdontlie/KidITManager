import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './fixture.js';
import { classSlots } from '../src/redesign/schedule.js';
import { classAttendanceDates } from '../shared/schedule-history.js';

test('historical corrections preserve later staffing, future changes and atomic rollback', async t => {
  const { app, sqlite } = createFixture();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); sqlite.close(); });
  const request = async body => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/classes/1`, body ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    return { status: res.status, data: await res.json() };
  };
  const slot = 'Thứ 5 (15:15 - 17:15)';
  const teachers = [{ name: 'A', role: 'teacher' }, { name: 'B', role: 'teacher' }];
  const mixed = [{ name: 'A', role: 'teacher' }, { name: 'B', role: 'ta' }];
  const change = (date, staff) => ({ effective_date: date, slot_staff: [{ slot, staff }] });
  assert.equal((await request(change('2026-10-15', mixed))).status, 200);
  assert.equal((await request(change('2026-10-01', teachers))).status, 200);
  let cls = (await request()).data;
  assert.deepEqual(classSlots(cls, '2026-10-08')[0].staff, teachers);
  assert.deepEqual(classSlots(cls, '2026-10-22')[0].staff, mixed);
  assert.equal((await request(change('2026-12-01', [{ name: 'C', role: 'teacher' }]))).status, 200);
  cls = (await request()).data;
  assert.deepEqual(classSlots(cls, '2026-10-29')[0].staff, mixed);
  assert.equal(classSlots(cls, '2026-12-03')[0].teacher, 'C');
  assert.deepEqual(classAttendanceDates(cls, '2026-10'), ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']);
  for (const date of ['2026-02-30', '2026-09-30', '', null]) assert.equal((await request(change(date, mixed))).status, 400);
  sqlite.exec("CREATE TRIGGER fail_history BEFORE INSERT ON class_schedule_history BEGIN SELECT RAISE(FAIL, 'history failure'); END;");
  assert.equal((await request({ ...change('2026-10-22', teachers), name: 'Không được lưu' })).status, 500);
  assert.deepEqual((await request()).data, cls);
});
