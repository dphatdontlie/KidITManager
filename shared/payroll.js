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

export function sessionPay(role, teacherCount, taCount, configured, singleTeacher = false) {
  if (!validStaffing(teacherCount, taCount, role)) return null;
  if (configured) {
    if (role === 'ta') return configured.ta_amount;
    if (singleTeacher && teacherCount === 1 && configured.solo_teacher_amount != null) return configured.solo_teacher_amount;
    if (taCount === 0 && configured.no_ta_amount != null) return configured.no_ta_amount;
    return configured.teacher_amount;
  }
  return (role === 'ta' ? 500000 : teacherCount === 1 && taCount > 0 ? 1000000 : 1500000) / 8;
}

export function withSessionPay(row) {
  const configured = row.class_pay_rate;
  const frozen = row.status === 'completed' && row.pay_snapshot;
  const rate = frozen ? frozen.pay_rate : row.override_amount != null ? row.override_amount : sessionPay(row.role, row.teacher_count, row.ta_count, configured, row.single_teacher);
  const basis = frozen ? frozen.pay_basis : row.override_amount != null ? 'override' : configured ? 'class' : 'staffing';
  return { ...row, pay_basis: basis, pay_frozen: Boolean(frozen), pay_rate: rate, pay_amount: row.status === 'cancelled' ? 0 : rate };
}

export function payRateOnDate(rate, date) {
  if (!rate?.pay_history?.length) return rate || null;
  return rate.pay_history.filter(item => item.effective_date <= date).at(-1) || null;
}

export function staffingWarnings(rows) {
  const groups = new Map();
  for (const row of rows.filter(r => r.status !== 'cancelled')) {
    const key = `${row.class_id}:${row.date}:${row.start_time}:${row.end_time}`;
    const group = groups.get(key) || []; group.push(row); groups.set(key, group);
  }
  return rows.map(row => {
    const group = groups.get(`${row.class_id}:${row.date}:${row.start_time}:${row.end_time}`) || [];
    const mismatch = row.status !== 'cancelled' && (group.some(peer => peer.teacher_count !== row.teacher_count || peer.ta_count !== row.ta_count || (peer.role === 'teacher' && row.role === 'teacher' && Boolean(peer.single_teacher) !== Boolean(row.single_teacher)))
      || new Set(group.filter(p => p.role === 'teacher').map(p => p.teacher_id)).size > row.teacher_count
      || new Set(group.filter(p => p.role === 'ta').map(p => p.teacher_id)).size > row.ta_count);
    return { ...row, staffing_warning: mismatch ? 'Đội hình cùng buổi chưa thống nhất. Cần đối chiếu các lượt công.' : '' };
  });
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
