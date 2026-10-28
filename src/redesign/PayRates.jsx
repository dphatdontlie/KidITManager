import { useEffect, useState } from 'react';
import { api, jsonBody } from '../lib/api';
import { useCenter } from './center-context';
import { money } from './format';
import { Button, Empty, Feedback, PanelHead, Select } from './ui';
import './payments.css';

export default function PayRates() {
  const d = useCenter();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [classId, setClassId] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api('/api/payroll/rates', { signal: controller.signal }).then(rows => {
      if (!controller.signal.aborted) { setRates(rows); setLoading(false); }
    }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setLoading(false); } });
    return () => controller.abort();
  }, [reload]);
  const edit = cls => {
    const saved = rates.find(row => row.class_id === cls.id);
    d.open({ title: `Phát lương · ${cls.name}`, submit: 'Lưu cấu hình lương', initial: {
      session_amount: saved?.session_amount ?? '', teacher_amount: saved?.teacher_amount ?? '', ta_amount: saved?.ta_amount ?? '',
    }, fields: [
      { key: 'session_amount', label: 'Tổng tiền mỗi suất (đ)', type: 'number', min: 0, max: 99999999999999, required: true, full: true, help: 'Tùy chỉnh riêng cho từng lớp. Ví dụ tổng 1.800.000đ cho 8 buổi thì nhập 225.000đ/suất. Không có trợ giảng: chia toàn bộ tiền suất cho số giáo viên thực tế.' },
      { key: 'teacher_amount', label: 'Tổng phần giáo viên / suất khi có trợ giảng (đ)', type: 'number', min: 0, max: 99999999999999, required: true, full: true, help: 'Chia đều phần tiền này cho số giáo viên thực tế. Có 2 người thì chia đôi; chỉ có 1 người thì nhận toàn bộ.' },
      { key: 'ta_amount', label: 'Mỗi trợ giảng nhận / suất (đ)', type: 'number', min: 0, max: 99999999999999, required: true, full: true, help: 'Nhập 0 nếu không trả lương trợ giảng. Buổi có hay không có trợ giảng được xác định bằng đội hình thực tế khi chấm công.' },
      { key: 'scope', label: 'Phạm vi áp dụng', type: 'display', full: true, text: 'Áp dụng cho mọi công của lớp, kể cả công đã ghi. Công đã xác nhận được cộng vào tổng thanh toán; công chưa xác nhận chỉ là dự kiến; buổi hủy nhận 0đ.' },
    ], validate: values => {
      if (['session_amount', 'teacher_amount', 'ta_amount'].some(key => values[key] === '' || !Number.isSafeInteger(Number(values[key])) || Number(values[key]) < 0 || Number(values[key]) > 99999999999999)) return 'Hãy nhập số tiền nguyên không âm cho cả ba ô.';
      return Number(values.teacher_amount) + Number(values.ta_amount) > Number(values.session_amount) ? 'Tiền giáo viên và trợ giảng của đội hình 1 + 1 không được vượt tiền mỗi suất.' : '';
    }, save: async values => {
      await api(`/api/payroll/rates/${cls.id}`, jsonBody({ session_amount: Number(values.session_amount), teacher_amount: Number(values.teacher_amount), ta_amount: Number(values.ta_amount), version: saved?.version || 0 }, 'PUT'));
      setReload(n => n + 1); await Promise.all([d.refreshWork(), d.refreshCore()]);
      d.notify(`Đã cập nhật lương theo suất cho ${cls.name}.`);
    } });
  };
  const classes = d.classes.filter(cls => !classId || cls.id === Number(classId));
  return <div className="payment-summary">
    <p className="payment-guidance">Tổng tiền tùy chỉnh theo từng lớp. Có trợ giảng: chia phần tiền giáo viên cho số giáo viên thực tế. Không có trợ giảng: chia toàn bộ tiền suất cho số giáo viên thực tế. Chỉ một giáo viên dạy thì người đó nhận toàn bộ phần tiền được chia.</p>
    <div className="filters"><Select label="Lớp cấu hình lương" value={classId} onChange={e => setClassId(e.target.value)}><option value="">Tất cả lớp</option>{d.classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}</Select><Button variant="secondary" onClick={() => { setReload(n => n + 1); d.refreshCore(); }}>Tải lại cấu hình</Button></div>
    <Feedback error={error} retry={() => setReload(n => n + 1)}/>
    <Feedback error={d.coreError} retry={() => d.refreshCore()}/>
    {loading ? <p className="inset" role="status">Đang tải cấu hình lương...</p> : !error && <section className="panel"><PanelHead title="Đơn giá phát lương theo suất" caption="Chưa cấu hình: giữ cách tính lương theo đội hình hiện tại. Thay đổi cấu hình sẽ tính lại cả công đã ghi."/>
      <div className="payment-table-scroll"><table className="payment-table"><thead><tr><th>Lớp</th><th>Tổng tiền mỗi suất</th><th>Phần giáo viên khi có trợ</th><th>Mỗi trợ giảng</th><th><span className="sr-only">Cấu hình</span></th></tr></thead><tbody>{classes.map(cls => {
        const rate = rates.find(row => row.class_id === cls.id);
        return <tr key={cls.id}><td data-label="Lớp"><strong>{cls.name}</strong>{rate && <small className="payment-saved">Lưu bởi {rate.updated_by}</small>}</td><td data-label="Tổng tiền mỗi suất">{rate ? money(rate.session_amount) : 'Chưa cấu hình'}</td><td data-label="Phần giáo viên khi có trợ">{rate ? money(rate.teacher_amount) : 'Theo đội hình'}</td><td data-label="Mỗi trợ giảng">{rate ? money(rate.ta_amount) : 'Theo đội hình'}</td><td><Button variant="secondary small" aria-label={`Cấu hình lương ${cls.name}`} onClick={() => edit(cls)}>{rate ? 'Sửa đơn giá' : 'Cấu hình lương'}</Button></td></tr>;
      })}</tbody></table></div>{!classes.length && <Empty title="Chưa có lớp phù hợp" text="Chọn lại bộ lọc hoặc tạo lớp trước khi cấu hình lương."/>}
      <p className="inset muted">Số người lấy từ đội hình thực tế đã lưu khi chấm công, kể cả người chưa tự ghi công. Thay đổi cách chia áp dụng cả công đã ghi. Mức trợ giảng tính riêng cho mỗi người; nhiều trợ giảng có thể làm tổng chi vượt tiền suất.</p>
    </section>}
  </div>;
}
