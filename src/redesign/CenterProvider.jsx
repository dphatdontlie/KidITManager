import { useCallback, useEffect, useRef, useState } from 'react';
import { api, jsonBody, localDate } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CLASS_SCHEDULE_STORAGE_KEY, notifyClassScheduleUpdated } from '../lib/class-events';
import { isScheduledAttendanceDate } from '../../shared/class-schedule';
import { classSlots, classPayload, validateScheduleRows } from './schedule';
import { money, normalizePayroll, studentClasses } from './format';
import { sessionPay, staffingCounts, validStaffing } from '../../shared/payroll';
import { CenterContext } from './center-context';
import { scheduleOnDate } from '../../shared/schedule-history';

export function CenterProvider({ children }) {
  const auth = useAuth();
  const [core, setCore] = useState({ classes: [], teachers: [], students: [], enrollments: [] });
  const [ready, setReady] = useState(false); const [coreError, setCoreError] = useState('');
  const [invoices, setInvoices] = useState([]); const [financeError, setFinanceError] = useState(''); const [financeLoading, setFinanceLoading] = useState(true);
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [workData, setWorkData] = useState({ month: '', rows: [], legacy: [] });
  const [workError, setWorkError] = useState(''); const [workLoading, setWorkLoading] = useState(true);
  const [model, setModel] = useState(null); const [notice, setNotice] = useState('');
  const coreRequest = useRef(0); const financeRequest = useRef(0); const workRequest = useRef(0);
  const refreshCore = useCallback(async signal => {
    const request = ++coreRequest.current; setCoreError('');
    try {
      const [classes, teachers, students, enrollments] = await Promise.all(['/classes', '/teachers', '/students', '/class-enrollments'].map(path => api(`/api${path}`, { signal })));
      if (request === coreRequest.current && !signal?.aborted) { setCore({ classes, teachers, students, enrollments }); setReady(true); }
    } catch (error) { if (request === coreRequest.current && !signal?.aborted) setCoreError(error.message); }
  }, []);
  const refreshFinance = useCallback(async signal => {
    const request = ++financeRequest.current; setFinanceLoading(true); setFinanceError('');
    try { const rows = await api('/api/invoices', { signal }); if (request === financeRequest.current && !signal?.aborted) setInvoices(rows.map(row => ({ ...row, amount: Number(row.amount), studentId: row.student_id, date: row.createdAt }))); }
    catch (error) { if (request === financeRequest.current && !signal?.aborted) setFinanceError(error.message); }
    finally { if (request === financeRequest.current && !signal?.aborted) setFinanceLoading(false); }
  }, []);
  const refreshWork = useCallback(async signal => {
    const request = ++workRequest.current; setWorkLoading(true); setWorkError('');
    try {
      const data = await api(`/api/payroll?month=${month}`, { signal });
      if (request === workRequest.current && !signal?.aborted) setWorkData({ month, rows: normalizePayroll(data), legacy: data.legacy });
    } catch (error) { if (request === workRequest.current && !signal?.aborted) setWorkError(error.message); }
    finally { if (request === workRequest.current && !signal?.aborted) setWorkLoading(false); }
  }, [month]);
  useEffect(() => { const controller = new AbortController(); refreshCore(controller.signal); refreshFinance(controller.signal); return () => controller.abort(); }, [refreshCore, refreshFinance]);
  useEffect(() => { const controller = new AbortController(); refreshWork(controller.signal); return () => controller.abort(); }, [refreshWork]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') { refreshCore(); refreshWork(); refreshFinance(); } };
    const storage = event => { if (event.key === CLASS_SCHEDULE_STORAGE_KEY) refreshCore(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh); window.addEventListener('storage', storage);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('storage', storage); };
  }, [refreshCore, refreshWork, refreshFinance]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
  const user = { ...auth.user, accountId: auth.user.id, id: auth.user.teacher_id ?? null };
  const role = auth.user.role;
  const { classes, teachers, students, enrollments } = core;
  const person = value => typeof value === 'string' ? value || 'Chưa phân công' : teachers.find(t => t.id === Number(value))?.name || 'Chưa phân công';
  const cls = id => classes.find(c => c.id === Number(id));
  const roster = id => students.filter(student => enrollments.some(row => row.class_id === Number(id) && row.student_id === student.id));
  const classesOf = id => studentClasses(id, enrollments, classes);
  const work = workData.month === month ? workData.rows : [];
  const open = next => setModel(next);
  const notify = text => setNotice(text);
  const close = () => setModel(current => current === model ? null : current);
  const requestSave = async (url, body, method = 'POST') => api(url, jsonBody(body, method));
  const addWork = (classId = '', selectedDate = localDate(), record) => {
    if (!user.id) { notify('Đăng nhập bằng tài khoản giáo viên để tự chấm công. Admin xem bảng tổng.'); return; }
    if (record?.source === 'historic') return;
    open({ title: record ? 'Sửa công của tôi' : 'Chấm công của tôi', initial: {
      teacher: user.name, classId, date: selectedDate, role: user.teacher_role === 2 ? 'ta' : 'teacher', status: 'completed', lesson: '', notes: '',
      ...(record ? { ...record, teacher: user.name, role: record.rawRole, slot: `${record.start}-${record.end}` } : {}),
    }, wide: true, submit: record ? 'Lưu thay đổi' : 'Xác nhận công',
    fields: values => {
      const selected = cls(values.classId); const slots = values.date ? classSlots(selected, values.date) : [];
      const defaults = staffingCounts(slots.find(s => s.key === values.slot)?.staff);
      const teacherCount = Number(values.teacher_count ?? Math.max(1, defaults.teacher_count));
      const taCount = Number(values.ta_count ?? Math.max(values.role === 'ta' ? 1 : 0, defaults.ta_count));
      const rate = sessionPay(values.role, teacherCount, taCount);
      if (record && Number(values.classId) === record.classId && values.date === record.date && !slots.some(s => s.key === values.slot)) slots.push({ key: `${record.start}-${record.end}`, label: record.slot, start: record.start, end: record.end });
      return [
        { key: 'teacher', label: 'Người chấm công', readOnly: true, full: true, help: 'Lấy từ tài khoản cá nhân. Mỗi giáo viên tự ghi công của mình.' },
        { key: 'classId', label: 'Lớp học', type: 'select', required: true, resetSlot: true, full: true, options: [{ value: '', label: 'Chọn lớp' }, ...classes.map(c => ({ value: c.id, label: c.name }))] },
        { key: 'date', label: 'Ngày dạy theo lịch lớp', type: 'scheduled-date', schedule: selected?.schedule || '', scheduleHistory: selected?.schedule_history, savedDate: record && Number(values.classId) === record.classId ? record.date : '', required: true, resetSlot: true },
        { key: 'slot', label: 'Suất theo lịch lớp', type: 'select', required: true, options: [{ value: '', label: slots.length ? 'Chọn suất' : 'Ngày này chưa có lịch lớp' }, ...slots.map(s => ({ value: s.key, label: s.label || `${s.start} - ${s.end}` }))] },
        { key: 'role', label: 'Vai trò trong buổi', type: 'select', options: [{ value: 'teacher', label: 'Dạy chính' }, { value: 'ta', label: 'Trợ giảng' }] },
        { key: 'teacher_count', label: 'Số giáo viên thực tế trong suất', type: 'select', displayValue: teacherCount, options: Array.from({ length: 20 }, (_, i) => ({ value: i + 1, label: `${i + 1} giáo viên` })) },
        { key: 'ta_count', label: 'Số trợ giảng thực tế trong suất', type: 'select', displayValue: taCount, options: Array.from({ length: 20 }, (_, i) => ({ value: i, label: `${i} trợ giảng` })), help: 'Gợi ý từ lịch lớp. Kiểm tra đội hình thực tế, kể cả người chưa tự chấm công.' },
        { key: 'pay_preview', label: 'Lương của bạn / suất', type: 'display', full: true, text: values.status === 'cancelled' ? '0đ (buổi đã hủy)' : rate == null ? 'Đội hình chưa hợp lệ' : `${money(rate)}${values.status === 'draft' ? ' (dự kiến, chưa xác nhận)' : ''}`, help: rate == null ? 'Mỗi suất có ít nhất 1 giáo viên, tối đa 20 người.' : `Đơn giá của bạn: ${money(rate * 8)} / 8 buổi. Mỗi giáo viên: ${money(sessionPay('teacher', teacherCount, taCount))}; mỗi trợ giảng: ${money(500000 / 8)}. Tổng chi phí suất: ${money(teacherCount * sessionPay('teacher', teacherCount, taCount) + taCount * 62500)}.` },
        { key: 'lesson', label: 'Tên bài học', required: true, full: true, placeholder: 'Nhập bài đã dạy trong suất này' },
        { key: 'status', label: 'Trạng thái', type: 'select', full: true, options: [{ value: 'completed', label: 'Đã dạy, tính công' }, { value: 'draft', label: 'Chưa xác nhận' }, { value: 'cancelled', label: 'Đã hủy, không tính công' }] },
        { key: 'notes', label: 'Ghi chú (không bắt buộc)', type: 'textarea', full: true },
      ];
    },
    validate: values => {
      if (record && Number(values.classId) !== record.classId) return 'Không chuyển công đã lưu sang lớp khác. Hãy hủy lượt cũ và ghi lượt mới.';
      const defaults = staffingCounts(classSlots(cls(values.classId), values.date).find(s => s.key === values.slot)?.staff);
      if (!validStaffing(Number(values.teacher_count ?? Math.max(1, defaults.teacher_count)), Number(values.ta_count ?? Math.max(values.role === 'ta' ? 1 : 0, defaults.ta_count)), values.role)) return 'Đội hình thực tế chưa hợp lệ. Kiểm tra số giáo viên và trợ giảng.';
      const unchanged = record && values.date === record.date && values.slot === `${record.start}-${record.end}`;
      if (!unchanged && (!isScheduledAttendanceDate(scheduleOnDate(cls(values.classId), values.date).schedule, values.date) || !classSlots(cls(values.classId), values.date).some(s => s.key === values.slot))) return 'Hãy chọn buổi và suất có trong lịch lớp.';
    },
    save: async values => {
      const slot = classSlots(cls(values.classId), values.date).find(s => s.key === values.slot);
      const defaults = staffingCounts(slot?.staff);
      const payload = { date: values.date, start_time: slot?.start || record?.start, end_time: slot?.end || record?.end, slot: slot?.label || record?.slot, role: values.role, teacher_count: Number(values.teacher_count ?? Math.max(1, defaults.teacher_count)), ta_count: Number(values.ta_count ?? Math.max(values.role === 'ta' ? 1 : 0, defaults.ta_count)), lesson: values.lesson.trim(), notes: values.notes, status: values.status, version: record?.version || 0 };
      await requestSave(`/api/classes/${values.classId}/personal-attendance${record ? `/${record.entryId}` : ''}`, payload, record ? 'PUT' : 'POST');
      if (values.date.slice(0, 7) !== month) setMonth(values.date.slice(0, 7)); else await refreshWork();
      notify('Đã lưu công của bạn. Người cùng ca tự chấm bằng tài khoản của họ.');
    } });
  };
  const deleteWork = record => open({ title: 'Xóa buổi chấm công?', content: <p>Xóa công của bạn tại {cls(record.classId)?.name || record.class_name}, ngày {record.date}, {record.start} - {record.end}, bài {record.lesson}. {record.pay_amount != null && `Số tiền ${money(record.pay_amount)} sẽ được bỏ khỏi bảng công.`} Không thể hoàn tác thao tác này.</p>, submit: 'Xóa buổi chấm công', save: async () => {
    await requestSave(`/api/classes/${record.classId}/personal-attendance/${record.entryId}`, { version: record.version }, 'DELETE');
    await refreshWork(); notify('Đã xóa buổi chấm công của bạn.');
  } });
  const teacherEditor = record => open({ title: record ? 'Sửa hồ sơ giáo viên' : 'Thêm giáo viên', initial: record || { name: '', role: 1, phone: '' }, fields: [
    { key: 'name', label: 'Họ và tên', required: true, full: true }, { key: 'role', label: 'Vai trò', type: 'select', options: [{ value: 1, label: 'Giáo viên' }, { value: 2, label: 'Trợ giảng' }] }, { key: 'phone', label: 'Số điện thoại', type: 'tel' },
  ], footer: record ? 'Tên đăng nhập được quản lý riêng trong mục Tài khoản.' : 'Tự tạo tài khoản theo họ tên, mật khẩu ban đầu kidit.', save: async values => {
    const result = await requestSave(`/api/teachers${record ? `/${record.id}` : ''}`, { name: values.name.trim(), role: Number(values.role), phone: values.phone || '' }, record ? 'PUT' : 'POST');
    await refreshCore(); if (record?.id === user.id) await auth.refreshUser(); notify(record ? 'Đã lưu hồ sơ giáo viên.' : `Đã thêm giáo viên. Tài khoản: ${result.username} / kidit`);
  } });
  const studentEditor = record => open({ title: record ? 'Sửa thông tin học sinh' : 'Thêm học sinh', initial: record || { name: '', phone: '', parentName: '', parentPhone: '' }, fields: [
    { key: 'name', label: 'Họ tên học sinh', required: true, full: true }, { key: 'phone', label: 'Điện thoại học sinh', type: 'tel', full: true }, { key: 'parentName', label: 'Tên phụ huynh' }, { key: 'parentPhone', label: 'Điện thoại phụ huynh', type: 'tel' },
  ], footer: 'Lưu hồ sơ rồi vào từng lớp để thêm học sinh. Một học sinh có thể học nhiều lớp.', save: async values => {
    await requestSave(`/api/students${record ? `/${record.id}` : ''}`, { name: values.name.trim(), phone: values.phone || '', parentName: values.parentName || '', parentPhone: values.parentPhone || '' }, record ? 'PUT' : 'POST');
    await refreshCore(); notify('Đã lưu hồ sơ học sinh.');
  } });
  const staffOptions = value => [{ value: '', label: 'Chưa phân công' }, ...teachers.map(t => ({ value: t.name, label: `${t.name} (${t.role === 2 ? 'TG' : 'GV'})` })), ...(value && !teachers.some(t => t.name === value) ? [{ value, label: `${value} (phân công đã lưu)` }] : [])];
  const classEditor = record => open({ title: record ? 'Sửa thông tin lớp' : 'Tạo lớp học', initial: { ...(scheduleOnDate(record, localDate()) || { name: '', teacher: '', ta: '', room: '' }), effective_date: localDate(), capacity: record?.capacity || '', scheduleRows: record ? classSlots(record).map(s => ({ day: s.day, time: s.key, staff: s.staff })) : [{ day: 1, time: '15:15-17:15', staff: [] }] }, wide: true, scheduleEditor: true, staffOptions, fields: [
    { key: 'name', label: 'Tên lớp', required: true, full: true, placeholder: 'Ví dụ: KID 1' },
    { key: 'effective_date', label: 'Áp dụng lịch và phân công từ ngày', type: 'effective-date', required: true, full: true, help: 'Từ 01/10/2026 trở đi. Các ngày trước ngày này giữ lịch cũ. Có thể chọn ngày quá khứ để bổ sung phân công cũ; phiên bản có hiệu lực sau đó vẫn được giữ.' },
    { key: 'room', label: 'Phòng học' }, { key: 'capacity', label: 'Sĩ số tối đa', type: 'number', min: 1, help: 'Để trống nếu không đặt giới hạn.' },
  ], validate: values => validateScheduleRows(values.scheduleRows, { allowEmpty: true }), save: async values => {
    await requestSave(`/api/classes${record ? `/${record.id}` : ''}`, classPayload(values), record ? 'PUT' : 'POST');
    await refreshCore(); notifyClassScheduleUpdated(record?.id); notify(`Đã lưu lịch từ ${values.effective_date}. Các ngày trước đó giữ lịch cũ.`);
  } });
  const enrollEditor = classId => {
    const current = cls(classId);
    open({ title: `Thêm học sinh vào ${current.name}`, initial: { studentId: '' }, fields: [{ key: 'studentId', label: 'Học sinh', type: 'select', required: true, full: true, options: [{ value: '', label: 'Chọn học sinh chưa có trong lớp' }, ...students.filter(s => !roster(classId).some(enrolled => enrolled.id === s.id)).map(s => ({ value: s.id, label: `${s.name} (#${s.id})` }))] }],
      validate: () => current.capacity && roster(classId).length >= current.capacity ? 'Lớp đã đủ chỗ. Hãy cập nhật sĩ số hoặc chọn lớp khác.' : '',
      footer: 'Học sinh vẫn được giữ trong các lớp đang học khác.', save: async values => { await requestSave(`/api/classes/${classId}/students`, { student_id: Number(values.studentId) }); await refreshCore(); notify('Đã thêm học sinh vào lớp.'); } });
  };
  const removeStudent = (classId, student) => open({ title: `Bỏ ${student.name} khỏi lớp?`, content: <p>Chỉ bỏ liên kết với {cls(classId)?.name}. Hồ sơ, các lớp khác và điểm danh cũ vẫn giữ nguyên.</p>, submit: 'Bỏ khỏi lớp', save: async () => { await api(`/api/classes/${classId}/students/${student.id}`, { method: 'DELETE' }); await refreshCore(); notify('Đã bỏ học sinh khỏi lớp.'); } });
  const deleteTeacher = teacher => open({ title: `Xóa hồ sơ ${teacher.name}?`, content: <p>Tài khoản liên kết cũng bị xóa. Hệ thống sẽ chặn nếu nhân sự đã có công giảng dạy.</p>, submit: 'Xóa nhân sự', save: async () => { await api(`/api/teachers/${teacher.id}`, { method: 'DELETE' }); await refreshCore(); notify('Đã xóa nhân sự.'); } });
  const accountEditor = (record, accounts) => open({ title: record ? `Thông tin đăng nhập · ${record.name}` : 'Tạo tài khoản giáo viên', initial: record ? { username: record.username, password: '' } : { teacher_id: '', name: '', role: 1, phone: '', username: '', password: 'kidit' }, wide: true,
    fields: values => record ? [{ key: 'username', label: 'Tên đăng nhập', required: true, full: true, maxLength: 100 }, { key: 'password', label: 'Mật khẩu mới', type: 'password', full: true, maxLength: 128, help: 'Để trống để giữ nguyên. Đổi mật khẩu sẽ yêu cầu tài khoản này đăng nhập lại.' }] : [
      { key: 'teacher_id', label: 'Hồ sơ giáo viên', type: 'select', full: true, options: [{ value: '', label: 'Tạo giáo viên mới' }, ...teachers.filter(t => !accounts.some(a => a.teacher_id === t.id)).map(t => ({ value: t.id, label: t.name }))] },
      ...(!values.teacher_id ? [{ key: 'name', label: 'Họ tên giáo viên', required: true, full: true }, { key: 'role', label: 'Vai trò', type: 'select', options: [{ value: 1, label: 'Giáo viên' }, { value: 2, label: 'Trợ giảng' }] }, { key: 'phone', label: 'Số điện thoại', type: 'tel' }] : []),
      { key: 'username', label: 'Tên đăng nhập (không bắt buộc)', full: true, maxLength: 100, help: 'Để trống để tạo theo họ tên không dấu viết liền.' }, { key: 'password', label: 'Mật khẩu', type: 'password', required: true, full: true, maxLength: 128 },
    ], validate: values => values.username && !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(values.username) ? 'Tên đăng nhập dùng chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.' : '',
    save: async values => {
      const result = await requestSave(`/api/accounts${record ? `/${record.id}` : ''}`, record ? values : { ...values, teacher_id: values.teacher_id ? Number(values.teacher_id) : undefined, role: Number(values.role), username: values.username || undefined }, record ? 'PUT' : 'POST');
      if (record?.id === user.accountId) await auth.refreshUser();
      await refreshCore(); notify(record ? 'Đã lưu thông tin tài khoản.' : `Đã tạo tài khoản ${result.username}.`);
    },
  });
  return <CenterContext.Provider value={{ ...core, ready, coreError, refreshCore, user, role, person, cls, roster, classesOf, work, month, setMonth, workLoading, workError, refreshWork, legacy: workData.month === month ? workData.legacy : [], invoices, financeLoading, financeError, refreshFinance, model, open, close, notice, notify, dismiss: () => setNotice(''), addWork, deleteWork, teacherEditor, studentEditor, classEditor, enrollEditor, removeStudent, deleteTeacher, accountEditor, auth }}>{children}</CenterContext.Provider>;
}
