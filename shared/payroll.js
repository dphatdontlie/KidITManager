export function staffingCounts(staff = []) {
  return {
    teacher_count: staff.filter(person => person.role === 'teacher').length,
    ta_count: staff.filter(person => person.role === 'ta').length,
  };
}

export function validStaffing(teacherCount, taCount, role) {
  return Number.isInteger(teacherCount) && teacherCount >= 1 && teacherCount <= 20
    && Number.isInteger(taCount) && taCount >= 0 && teacherCount + taCount <= 20
    && (role === 'teacher' || (role === 'ta' && taCount >= 1));
}

export function sessionPay(role, teacherCount, taCount, configured) {
  if (!validStaffing(teacherCount, taCount, role)) return null;
  if (configured) {
    if (role === 'ta') return configured.ta_amount;
    const teacherPool = taCount === 0 ? configured.session_amount : configured.teacher_amount;
    return teacherPool / teacherCount;
  }
  return (role === 'ta' ? 500000 : teacherCount === 1 && taCount > 0 ? 1000000 : 1500000) / 8;
}

export function withSessionPay(row) {
  const configured = row.class_pay_rate;
  const rate = sessionPay(row.role, row.teacher_count, row.ta_count, configured);
  return { ...row, pay_basis: configured ? 'class' : 'staffing', pay_rate: rate, pay_amount: row.status === 'cancelled' ? 0 : rate };
}

export function summarizePay(rows) {
  return rows.reduce((total, row) => ({
    amount: total.amount + (row.pay_amount ?? 0),
    missing: total.missing + (row.pay_amount == null ? 1 : 0),
  }), { amount: 0, missing: 0 });
}

export function summarizeTeacherPayments(teachers, work, bonuses) {
  const people = new Map(teachers.map(teacher => [teacher.id, { id: teacher.id, name: teacher.name }]));
  for (const row of work) if (!people.has(row.teacherId)) people.set(row.teacherId, { id: row.teacherId, name: row.teacherName });
  return [...people.values()].map(person => {
    const sessions = work.filter(row => row.teacherId === person.id && row.status === 'completed');
    const salary = summarizePay(sessions);
    const bonus = bonuses.find(row => row.teacher_id === person.id);
    return { ...person, count: sessions.length, salary: salary.amount, missing: salary.missing, bonus: bonus?.amount || 0, total: salary.amount + (bonus?.amount || 0), savedBonus: bonus };
  }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function summarizeSessionWork(rows) {
  const summary = new Map();
  const counted = new Set();
  for (const row of rows) {
    const attendanceKey = `${row.session_id}-${row.teacher_id}`;
    if (counted.has(attendanceKey)) continue;
    counted.add(attendanceKey);
    const key = `${row.teacher_id}-${row.role}`;
    const item = summary.get(key) || { id: key, name: `${row.teacher_name} (#${row.teacher_id})`, role: row.role, count: 0 };
    item.count++;
    summary.set(key, item);
  }
  return Array.from(summary.values());
}
