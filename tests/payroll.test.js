import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionPay, summarizePay, withSessionPay } from '../shared/payroll.js';

test('the four staffing arrangements pay each person separately', () => {
  for (const [teachers, assistants, teacherPay, total] of [[1, 0, 187500, 187500], [2, 0, 187500, 375000], [1, 1, 125000, 187500], [2, 1, 187500, 437500]]) {
    assert.equal(sessionPay('teacher', teachers, assistants), teacherPay);
    const assistantPay = assistants ? sessionPay('ta', teachers, assistants) : 0;
    if (assistants) assert.equal(assistantPay, 62500);
    assert.equal(teachers * teacherPay + assistants * assistantPay, total);
  }
});

test('invalid or missing staffing never silently contributes salary', () => {
  for (const [teachers, assistants, role] of [[null, null, 'teacher'], [0, 1, 'ta'], [1, 0, 'ta'], [1.5, 1, 'teacher'], [20, 1, 'teacher'], [1, -1, 'teacher'], [1, 1, 'invalid']]) assert.equal(sessionPay(role, teachers, assistants), null);
  assert.deepEqual(summarizePay([{ pay_amount: null }, { pay_amount: 187500 }]), { amount: 187500, missing: 1 });
  assert.equal(withSessionPay({ role: 'teacher', teacher_count: 1, ta_count: 1, status: 'cancelled' }).pay_amount, 0);
  assert.equal(withSessionPay({ role: 'teacher', teacher_count: 1, ta_count: 1, status: 'draft' }).pay_amount, 125000);
});

test('configured class rates split the applicable teacher pool by actual teachers and transfer the assistant share when absent', () => {
  const configured = { session_amount: 187500, teacher_amount: 125000, ta_amount: 62500 };
  for (const teachers of [1, 2]) {
    assert.equal(sessionPay('teacher', teachers, 0, configured), 187500 / teachers);
    assert.equal(sessionPay('teacher', teachers, 1, configured), 125000 / teachers);
    assert.equal(sessionPay('ta', teachers, 1, configured), 62500);
  }
  assert.equal(sessionPay('teacher', 1, 2, configured), 125000);
  assert.equal(sessionPay('ta', 1, 0, configured), null);
  assert.equal(sessionPay('teacher', 1, null, configured), null);
  assert.equal(sessionPay('teacher', 0, 0, configured), null);
  assert.equal(sessionPay('teacher', 1, 1, { ...configured, ta_amount: 0 }), 125000);
  const row = { role: 'teacher', teacher_count: 1, ta_count: 0, class_pay_rate: configured };
  assert.equal(withSessionPay({ ...row, status: 'completed' }).pay_amount, 187500);
  assert.equal(withSessionPay({ ...row, status: 'draft' }).pay_amount, 187500);
  assert.equal(withSessionPay({ ...row, status: 'cancelled' }).pay_amount, 0);
  const flexible = { session_amount: 1800000 / 8, teacher_amount: 1200000 / 8, ta_amount: 600000 / 8 };
  assert.equal(sessionPay('teacher', 2, 0, flexible), 112500);
  assert.equal(sessionPay('teacher', 1, 0, flexible), 225000);
  assert.equal(sessionPay('teacher', 2, 1, flexible), 75000);
  assert.equal(sessionPay('teacher', 1, 1, flexible), 150000);
});
