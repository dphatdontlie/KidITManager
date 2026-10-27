import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useCenter } from './center-context';
import { useViewState } from './useViewState';
import { api, downloadCsv, jsonBody } from '../lib/api';
import { money } from './format';
import { Avatar, Button, Empty, Feedback, PanelHead, Select } from './ui';
import { summarizeTeacherPayments } from '../../shared/payroll';
import './payments.css';

export default function PaymentSummary() {
  const d = useCenter();
  const [teacherId, setTeacherId] = useViewState('payments-person', '');
  const cacheKey = `bonuses:${d.month}`;
  const [data, setData] = useState({ month: '', rows: [] });
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [reload, setReload] = useState(0);
  useEffect(() => {
    const cached = d.resourceCache.current.get(cacheKey);
    if (cached && !reload) { setData({ month: d.month, rows: cached }); setLoading(false); setError(''); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    api(`/api/payroll/bonuses?month=${d.month}`, { signal: controller.signal }).then(rows => {
      if (controller.signal.aborted) return;
      d.resourceCache.current.set(cacheKey, rows); setData({ month: d.month, rows }); setLoading(false);
    }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setLoading(false); } });
    return () => controller.abort();
  }, [d.month, cacheKey, d.resourceCache, reload]);
  const ready = !loading && !error && !d.workLoading && !d.workError && data.month === d.month;
  const people = summarizeTeacherPayments(d.teachers, d.work, data.month === d.month ? data.rows : []);
  const rows = people.filter(person => !teacherId || person.id === Number(teacherId));
  const totals = rows.reduce((sum, row) => ({ salary: sum.salary + row.salary, bonus: sum.bonus + row.bonus, total: sum.total + row.total, missing: sum.missing + row.missing }), { salary: 0, bonus: 0, total: 0, missing: 0 });
  const refresh = () => { d.refreshWork(); setReload(n => n + 1); };
  const editBonus = person => {
    const month = d.month;
    d.open({ title: `Thưởng · ${person.name} · ${month}`, initial: { amount: person.savedBonus?.amount ?? '', note: person.savedBonus?.note || '' }, fields: [
      { key: 'amount', label: 'Tiền thưởng (đ)', type: 'number', min: 0, max: 99999999999999, required: true, full: true, help: 'Tổng tiền thưởng của người này trong tháng đang chọn. Nhập 0 nếu không có thưởng.' },
      { key: 'note', label: 'Ghi chú thưởng (không bắt buộc)', type: 'textarea', maxLength: 1000, full: true },
    ], validate: values => !Number.isSafeInteger(Number(values.amount)) || Number(values.amount) < 0 ? 'Nhập số tiền nguyên không âm.' : '', submit: 'Lưu thưởng', save: async values => {
      await api(`/api/payroll/bonuses/${person.id}`, jsonBody({ month, amount: Number(values.amount), note: values.note, version: person.savedBonus?.version || 0 }, 'PUT'));
      d.resourceCache.current.delete(`bonuses:${month}`); setReload(n => n + 1); d.notify(`Đã lưu thưởng tháng ${month} cho ${person.name}.`);
    } });
  };
  const exportRows = () => downloadCsv(`Tong-thanh-toan-${d.month}.csv`, [['Tháng', 'Mã nhân sự', 'Giáo viên / trợ giảng', 'Số suất đã xác nhận', 'Lương theo suất (đ)', 'Thưởng (đ)', 'Tổng nhận (đ)', 'Suất thiếu đội hình', 'Ghi chú thưởng'], ...rows.map(person => [d.month, person.id, person.name, person.count, person.salary, person.bonus, person.missing ? `Tạm tính: ${person.total}` : person.total, person.missing, person.savedBonus?.note || ''])]);
  return <div className="payment-summary"><div className="filters"><label className="inline-date">Tháng thanh toán<input aria-label="Tháng thanh toán" type="month" value={d.month} onChange={e => e.target.value && d.setMonth(e.target.value)}/></label><Select label="Giáo viên / trợ giảng" value={teacherId} onChange={e => setTeacherId(e.target.value)}><option value="">Tất cả nhân sự</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</Select><Button variant="secondary" onClick={refresh}>Cập nhật</Button><Button variant="secondary" disabled={!ready || !rows.length} onClick={exportRows}>Xuất tổng thanh toán</Button></div>
    <p className="payment-guidance">Tổng hợp toàn bộ lớp theo tháng. Tổng nhận = lương các suất đã xác nhận + thưởng đã nhập. Suất nháp hoặc hủy không cộng vào lương.</p>
    <Feedback error={error || d.workError} retry={refresh}/>{!ready && !error && !d.workError && <p role="status" className="inset">Đang tổng hợp lương và tiền thưởng...</p>}
    {ready && <><div className="payment-totals"><div><span>Lương theo suất</span><strong>{money(totals.salary)}</strong></div><div><span>Tiền thưởng</span><strong>{money(totals.bonus)}</strong></div><div><span>{totals.missing ? 'Tổng nhận tạm tính' : 'Tổng nhận'}</span><strong>{money(totals.total)}</strong></div></div>{totals.missing > 0 && <p className="payment-incomplete" role="status">Còn {totals.missing} suất thiếu đội hình thực tế, chưa cộng đủ vào tổng nhận. Mở tab tổng công để bổ sung.</p>}
      <section className="panel"><PanelHead title={`Tổng thanh toán · ${d.month}`} caption="Bấm dấu cộng ở cột Thưởng để nhập hoặc điều chỉnh số tiền."/><div className="payment-table-scroll"><table className="payment-table"><thead><tr><th>Giáo viên / trợ giảng</th><th>Số suất</th><th>Lương theo suất</th><th>Thưởng</th><th>Tổng nhận</th></tr></thead><tbody>{rows.map(person => <tr key={person.id}><td data-label="Nhân sự"><div className="payment-person"><Avatar name={person.name}/><strong>{person.name}</strong></div></td><td data-label="Số suất">{person.count}</td><td data-label="Lương theo suất"><strong>{money(person.salary)}</strong>{person.missing > 0 && <small className="payment-missing">{person.missing} suất chưa đủ dữ liệu</small>}</td><td data-label="Thưởng"><div className="payment-bonus"><strong>{money(person.bonus)}</strong><Button variant="ghost small" icon={Plus} aria-label={`Nhập thưởng cho ${person.name}`} onClick={() => editBonus(person)}>Thưởng</Button></div>{person.savedBonus?.note && <small className="payment-bonus-note" title={person.savedBonus.note}>{person.savedBonus.note}</small>}{person.savedBonus && <small className="payment-saved">Lưu bởi {person.savedBonus.updated_by}</small>}</td><td data-label="Tổng nhận" className="payment-received"><strong>{money(person.total)}</strong>{person.missing > 0 && <small>Tạm tính</small>}</td></tr>)}</tbody></table></div>{!rows.length && <Empty title="Chưa có nhân sự để tổng hợp" text="Thêm hồ sơ giáo viên hoặc chọn lại bộ lọc."/>}</section>
    </>}
  </div>;
}
