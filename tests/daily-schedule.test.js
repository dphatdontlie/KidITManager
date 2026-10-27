import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScheduleBlocks, buildWeekScheduleBlocks, scheduleBlocksOnDate, shiftScheduleDate } from '../src/redesign/schedule.js';

test('a weekly view resolves each day separately when staffing changes midweek', () => {
  const schedule = 'Thứ 2 (15:15 - 17:15), Thứ 5 (15:15 - 17:15)';
  const cls = { id: 1, name: 'KID 2', schedule_history: [
    { effective_date: '2026-10-01', schedule, teacher: 'A, B', ta: '' },
    { effective_date: '2026-10-14', schedule, teacher: 'A', ta: 'B' },
  ] };
  const blocks = buildWeekScheduleBlocks([cls], name => name, '2026-10-15');
  assert.deepEqual(blocks.map(row => [row.dayIndex, row.teacher, row.ta]), [[1, 'A, B', ''], [4, 'A', 'B']]);
});

test('daily navigation crosses month, year, and leap-day boundaries without timezone shifts', () => {
  for (const [date, delta, expected] of [
    ['2026-10-01', -1, '2026-09-30'], ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'], ['2027-01-01', -1, '2026-12-31'],
    ['2028-02-28', 1, '2028-02-29'], ['2028-03-01', -1, '2028-02-29'],
    ['2026-02-28', 1, '2026-03-01'], ['', 1, ''], ['2026-02-30', 1, ''],
    ['9999-12-31', 1, ''], ['1000-01-01', -1, ''], ['2026-10-01', NaN, ''],
  ]) assert.equal(shiftScheduleDate(date, delta), expected);
});

test('a selected date shows only its weekday, sorted shifts and per-slot staff, including simultaneous classes', () => {
  const classes = [
    { id: 1, name: 'KID 1', schedule: 'Thứ 5 (15:15 - 17:15), Thứ 6 (09:00 - 11:00)', slot_staff: [{ slot: 'Thứ 5 (15:15 - 17:15)', staff: [{ name: 'GV thứ 5', role: 'teacher' }, { name: 'TG thứ 5', role: 'ta' }] }] },
    { id: 2, name: 'KID 2', schedule: 'Thứ 5 (07:00 - 09:00), Thứ 5 (15:15 - 17:15)' },
  ];
  const blocks = buildScheduleBlocks(classes, name => name || 'Chưa phân công');
  const original = blocks.map(block => block.id);
  const first = scheduleBlocksOnDate(blocks, '2026-10-01');
  assert.deepEqual(first.map(block => block.className), ['KID 2', 'KID 1', 'KID 2']);
  assert.equal(first[1].teacher, 'GV thứ 5');
  assert.equal(first[1].ta, 'TG thứ 5');
  assert.equal(scheduleBlocksOnDate(blocks, '2026-10-02').length, 1);
  assert.equal(scheduleBlocksOnDate(blocks, '2026-10-03').length, 0);
  assert.equal(scheduleBlocksOnDate(blocks, '').length, 0);
  assert.equal(scheduleBlocksOnDate(blocks, '2026-02-30').length, 0);
  assert.deepEqual(scheduleBlocksOnDate(first.filter(block => block.teacher === 'GV thứ 5'), '2026-10-01').map(block => block.classId), [1]);
  assert.deepEqual(blocks.map(block => block.id), original);
});
