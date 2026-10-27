import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceDatesInMonth, isScheduledAttendanceDate, preferredAttendanceDate, weekdayLabel } from '../shared/class-schedule.js';
import { createFixture } from './fixture.js';

test('calendar starts on Thursday 01/10/2026 and follows the real month calendar', () => {
  const thursday = 'Thứ 5 (15:15 - 17:15)';
  assert.equal(weekdayLabel('2026-10-01'), 'Thứ 5');
  assert.deepEqual(attendanceDatesInMonth(thursday, '2026-10'), ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']);
  assert.deepEqual(attendanceDatesInMonth(thursday, '2026-09'), []);
  assert.equal(isScheduledAttendanceDate(thursday, '2026-09-24'), false);
  assert.equal(isScheduledAttendanceDate(thursday, '2026-10-02'), false);
  assert.deepEqual(attendanceDatesInMonth('Thứ 2 (17:15 - 19:15), Chủ nhật (07:00 - 09:00)', '2026-10').map(d => Number(d.slice(8))), [4, 5, 11, 12, 18, 19, 25, 26]);
  assert.deepEqual(attendanceDatesInMonth('Thứ 5 (07:00 - 09:00),Thứ 5 (15:15 - 17:15)', '2026-10'), attendanceDatesInMonth(thursday, '2026-10'));
  assert.deepEqual(attendanceDatesInMonth('', '2026-10'), []);
  assert.deepEqual(attendanceDatesInMonth('Thứ 5 (25:00 - 27:00)', '2026-10'), []);
  assert.deepEqual(attendanceDatesInMonth(thursday, '2026-13'), []);
  assert.equal(isScheduledAttendanceDate(thursday, '2026-02-30'), false);
  assert.equal(attendanceDatesInMonth('Thứ 3 (07:00 - 09:00)', '2028-02').at(-1), '2028-02-29');
  assert.equal(preferredAttendanceDate(['2026-10-04', '2026-10-05', '2026-10-11', '2026-10-12', '2026-10-18'], '2026-10-15'), '2026-10-12');
});

test('API validates each attendance day against the schedule effective on that day', async t => {
  const { app, sqlite } = createFixture();
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); sqlite.close(); });
  const request = async (path, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const initial = await request('/api/classes/1/attendance-dates?month=2026-10');
  assert.equal(initial.status, 200); assert.equal(initial.data.dates[0], '2026-10-01'); assert.equal(initial.data.dates.length, 5);
  assert.deepEqual((await request('/api/classes/1/attendance-dates?month=2026-09')).data.dates, []);
  const mark = (date, student_id = 1, status = 'present') => request('/api/classes/1/attendance', { date, student_id, status });
  assert.equal((await mark('2026-09-24')).status, 400);
  assert.equal((await mark('2026-10-02')).status, 409);
  assert.equal((await request('/api/classes/1/attendance?date=2026-10-02')).status, 409);
  assert.equal((await mark('2026-10-01', 99)).status, 400);
  assert.equal((await mark('2026-10-01')).status, 200);
  assert.equal((await mark('2026-10-01', 1, 'absent')).status, 200);
  assert.deepEqual((await request('/api/classes/1/attendance?date=2026-10-01')).data, [{ student_id: 1, status: 'absent' }]);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM attendance').get().n, 1);

  const changed = await request('/api/classes/1', { effective_date: '2026-10-12', schedule: 'Thứ 2 (17:15 - 19:15), Chủ nhật (07:00 - 09:00)' }, 'PUT');
  assert.equal(changed.status, 200);
  const dates = (await request('/api/classes/1/attendance-dates?month=2026-10')).data.dates;
  assert.deepEqual(dates.map(d => Number(d.slice(8))), [1, 8, 12, 18, 19, 25, 26]);
  assert.equal((await mark('2026-10-01', 1, 'absent')).status, 200);
  assert.equal(sqlite.prepare("SELECT status FROM attendance WHERE date='2026-10-01'").get().status, 'absent');
  assert.deepEqual((await request('/api/classes/1/attendance?date=2026-10-12')).data, []);
  assert.equal((await mark('2026-10-12')).status, 200);
  assert.equal((await mark('2026-10-15')).status, 409);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM attendance').get().n, 2);
  assert.equal((await request('/api/classes/1/attendance-dates?month=2026-13')).status, 400);
  assert.equal((await request('/api/classes/99/attendance-dates?month=2026-10')).status, 404);

  await request('/api/classes/1', { effective_date: '2026-10-20', schedule: '' }, 'PUT');
  assert.deepEqual((await request('/api/classes/1/attendance-dates?month=2026-10')).data.dates.map(d=>Number(d.slice(8))), [1, 8, 12, 18, 19]);
  assert.equal((await mark('2026-10-26')).status, 409);
  assert.equal((await mark('2026-10-12')).status, 200);
});
