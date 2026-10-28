import { useState } from 'react';
import { api, jsonBody } from '../lib/api';
import { useCenter } from './center-context';
import { dateLabel, money } from './format';
import { Button, Empty, Feedback, PanelHead } from './ui';

export default function RecalculatePay({ classId }) {
  const d = useCenter();
  const [selected, setSelected] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const eligible = d.work.filter(w => w.source === 'personal' && w.status === 'completed' && (!classId || w.classId === Number(classId)));
  const chosen = eligible.filter(w => selected.includes(w.entryId));
  const preview = async () => {
    setBusy(true); setError('');
    try {
      const changes = await api('/api/payroll/recalculate', jsonBody({ entries: chosen.map(w => ({ id: w.entryId, version: w.version })) }));
      d.open({ title: 'Xem trước tính lại lương', wide: true, submit: 'Xác nhận số tiền mới', content: <div className="payment-table-scroll"><table className="payment-table"><thead><tr><th>Người dạy / ngày</th><th>Đã chốt</th><th>Sau tính lại</th></tr></thead><tbody>{changes.map(row => <tr key={row.id}><td data-label="Người dạy / ngày">{row.teacher_name} · {dateLabel(row.date)}</td><td data-label="Đã chốt">{row.before == null ? 'Chưa đủ dữ liệu' : money(row.before)}</td><td data-label="Sau tính lại">{money(row.after)}</td></tr>)}</tbody></table><p className="inset muted">Tính theo đơn giá có hiệu lực vào ngày dạy. Đơn giá riêng của lượt công vẫn được giữ.</p></div>, save: async () => {
        await api('/api/payroll/recalculate', jsonBody({ apply: true, entries: changes.map(row => ({ id: row.id, version: row.version, expected: row.after, rate_version: row.rate_version })) }));
        setSelected([]); await d.refreshWork(); d.notify('Đã tính lại các công đã chọn và lưu lịch sử thay đổi.');
      } });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <section className="panel"><PanelHead title="Tính lại công đã xác nhận" caption="Chọn tối đa 200 lượt cần sửa, xem tiền trước/sau rồi xác nhận. Công cũ trước khi dùng tài khoản cá nhân chỉ giữ để đối chiếu."/>
    <div className="filters inset"><label>Tháng công<input aria-label="Tháng tính lại lương" type="month" value={d.month} onChange={e => { if (e.target.value) { d.setMonth(e.target.value); setSelected([]); } }}/></label><Button disabled={busy || d.workLoading || !!d.workError || !chosen.length || chosen.length > 200} onClick={preview}>{busy ? 'Đang tính...' : `Xem trước ${chosen.length} công đã chọn`}</Button><Button variant="ghost" onClick={() => { setSelected([]); d.refreshWork(); }}>Tải lại công</Button></div>
    <Feedback error={error}/><Feedback error={d.workError} retry={d.refreshWork}/>{d.workLoading ? <p className="inset" role="status">Đang tải công...</p> : <div className="pay-recalculate-list">{eligible.map(w => <label key={w.id}><input type="checkbox" checked={selected.includes(w.entryId)} onChange={e => setSelected(ids => e.target.checked ? [...ids, w.entryId] : ids.filter(id => id !== w.entryId))}/><span>{w.teacherName} · {d.cls(w.classId)?.name} · {dateLabel(w.date)} {w.start} · {w.pay_amount == null ? 'Chưa đủ dữ liệu' : money(w.pay_amount)}{w.staffing_warning && <small className="payment-missing">{w.staffing_warning}</small>}</span></label>)}{!eligible.length && <Empty title="Không có công đã xác nhận trong bộ lọc"/>}</div>}
  </section>;
}
