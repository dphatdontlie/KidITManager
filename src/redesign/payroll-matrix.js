export function buildPayrollMatrix(month, classes, records) {
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dates = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const columns = new Map(classes.map(cls => [cls.id, { id: cls.id, name: cls.name, teachers: 2, assistants: 1 }]));
  const byDate = new Map();
  for (const record of records) {
    if (!record.date.startsWith(`${month}-`)) continue;
    if (!columns.has(record.classId)) columns.set(record.classId, {
      id: record.classId, name: record.class_name || `Lớp #${record.classId}`, teachers: 2, assistants: 1,
    });
    if (!byDate.has(record.date)) byDate.set(record.date, new Map());
    const day = byDate.get(record.date);
    if (!day.has(record.classId)) day.set(record.classId, new Map());
    const slots = day.get(record.classId);
    const key = `${record.start}–${record.end}`;
    if (!slots.has(key)) slots.set(key, { time: key, teachers: [], assistants: [] });
    const slot = slots.get(key);
    const group = record.rawRole === 'ta' ? 'assistants' : 'teachers';
    slot[group].push(record);
    const col = columns.get(record.classId);
    col[group] = Math.max(col[group], slot[group].length);
    if (record.status === 'completed') {
      col.total = (col.total || 0) + (record.pay_amount ?? 0);
      col.missing = (col.missing || 0) + Number(record.pay_amount == null);
    }
  }
  const groups = [...columns.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
  const rows = dates.map(date => {
    const day = byDate.get(date);
    const classSlots = groups.map(column => [...(day?.get(column.id)?.values() || [])].sort((a, b) => a.time.localeCompare(b.time)));
    return { date, classSlots, slotCount: Math.max(1, ...classSlots.map(slots => slots.length)) };
  });
  return { groups, rows };
}
