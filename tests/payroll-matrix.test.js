import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayrollMatrix } from '../src/redesign/payroll-matrix.js';

test('matrix keeps days, additional slots and extra staff visible without counting draft or cancelled pay', () => {
  const base = { classId: 10, date: '2026-10-01', start: '09:00', end: '10:30', rawRole: 'teacher', status: 'completed', pay_amount: 100000 };
  const records = [
    { ...base, id: 1 }, { ...base, id: 2 }, { ...base, id: 3 },
    { ...base, id: 4, rawRole: 'ta', pay_amount: null },
    { ...base, id: 5, rawRole: 'ta', status: 'draft' },
    { ...base, id: 6, start: '15:15', end: '17:15', status: 'cancelled' },
    { ...base, id: 7, date: '2026-11-01' },
  ];
  const { groups, rows } = buildPayrollMatrix('2026-10', [{ id: 10, name: 'KID 10' }, { id: 2, name: 'KID 2' }], records);
  assert.equal(rows.length, 31);
  assert.deepEqual(groups.map(group => group.name), ['KID 2', 'KID 10']);
  assert.deepEqual([groups[1].teachers, groups[1].assistants, groups[1].total, groups[1].missing], [3, 2, 300000, 1]);
  assert.equal(rows[0].slotCount, 2);
  assert.deepEqual(rows[0].classSlots[1].map(slot => slot.time), ['09:00–10:30', '15:15–17:15']);
  assert.deepEqual(rows[1].classSlots, [[], []]);
});
