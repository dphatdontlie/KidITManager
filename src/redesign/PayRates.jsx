import { useEffect, useState } from 'react';
import { api, jsonBody, localDate } from '../lib/api';
import { useCenter } from './center-context';
import { dateLabel, money } from './format';
import { Button, Empty, Feedback, PanelHead, Select } from './ui';
import RecalculatePay from './RecalculatePay';
import './payments.css';

const fields = [
  ['session_amount', 'Tiền mỗi suất', 'Tổng tiền mỗi suất (đ)', 'Ngân sách đối chiếu, không tự chia thành lương. Ví dụ 1.800.000đ cho 8 buổi thì nhập 225.000đ.'],
  ['teacher_amount', 'Giáo viên có trợ', 'Mỗi giáo viên có trợ giảng (đ/suất)', 'Đơn giá mỗi người; không tự chia đôi khi có hai giáo viên.'],
  ['ta_amount', 'Mỗi trợ giảng', 'Mỗi trợ giảng (đ/suất)', 'Tính theo số trợ giảng thực tế của buổi đó.'],
  ['no_ta_amount', 'Giáo viên không trợ', 'Giáo viên không có trợ giảng (đ/suất)', 'Không bắt buộc. Trống: dùng mức giáo viên thông thường. Nhập 0: nhận 0đ.'],
  ['solo_teacher_amount', '1 người thay 2 giáo viên', 'Lớp 2 giáo viên nhưng chỉ 1 người dạy (đ/suất)', 'Không bắt buộc. Ưu tiên mức này khi chọn tình huống dạy thay. Trống: xét mức không trợ rồi mức thông thường.'],
];
const show = (key, value) => value == null ? key === 'no_ta_amount' || key === 'solo_teacher_amount' ? 'Dùng mức thông thường' : 'Chưa cấu hình' : money(value);

export default function PayRates() {
  const d = useCenter();
  const [rates, setRates] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [reload, setReload] = useState(0), [classId, setClassId] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api('/api/payroll/rates', { signal: controller.signal }).then(rows => {
      if (!controller.signal.aborted) { setRates(rows); setLoading(false); }
    }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setLoading(false); } });
    return () => controller.abort();
  }, [reload]);
  const edit = (cls, rule) => {
    const current = rates.find(row => row.class_id === cls.id), saved = rule || current;
    d.open({ title: `Đơn giá · ${cls.name}`, submit: 'Lưu đơn giá', initial: {
      ...Object.fromEntries(fields.map(([key]) => [key, saved?.[key] ?? ''])), effective_date: rule?.effective_date || localDate(),
    }, fields: [
      { key: 'effective_date', label: 'Bắt đầu áp dụng từ ngày', type: 'effective-date', required: true, full: true, help: 'Chọn theo ngày dạy. Công đã xác nhận giữ tiền đã chốt; admin có thể chọn công để xem trước và tính lại.' },
      ...fields.map(([key, , label, help], index) => ({ key, label, help, type: 'number', min: 0, max: 99999999999999, required: index < 3, full: true })),
    ], validate: values => fields.some(([key], index) => (index < 3 || values[key] !== '') && (values[key] === '' || !Number.isSafeInteger(Number(values[key])) || Number(values[key]) < 0 || Number(values[key]) > 99999999999999)) ? 'Hãy nhập số tiền nguyên không âm; hai đơn giá tình huống có thể để trống.' : '',
    save: async values => {
      const amounts = Object.fromEntries(fields.map(([key]) => [key, values[key] === '' ? null : Number(values[key])]));
      await api(`/api/payroll/rates/${cls.id}`, jsonBody({ ...amounts, effective_date: values.effective_date, version: current?.version || 0 }, 'PUT'));
      setReload(n => n + 1); await Promise.all([d.refreshWork(), d.refreshCore()]); d.notify(`Đã lưu đơn giá ${cls.name}; tiền công đã chốt được giữ nguyên.`);
    } });
  };
  const classes = d.classes.filter(cls => !classId || cls.id === Number(classId));
  return <div className="payment-summary">
    <p className="payment-guidance">Mỗi KID có đơn giá riêng theo ngày bắt đầu áp dụng. Lương chọn theo tình huống thực tế của từng lượt công; không tự chuyển tiền trợ giảng hoặc tự chia tổng tiền suất.</p>
    <div className="filters"><Select label="Lớp cấu hình lương" value={classId} onChange={e => setClassId(e.target.value)}><option value="">Tất cả lớp</option>{d.classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}</Select><Button variant="secondary" onClick={() => { setReload(n => n + 1); d.refreshCore(); }}>Tải lại cấu hình</Button></div>
    <Feedback error={error} retry={() => setReload(n => n + 1)}/><Feedback error={d.coreError} retry={() => d.refreshCore()}/>
    {loading ? <p className="inset" role="status">Đang tải cấu hình lương...</p> : !error && <section className="panel"><PanelHead title="Đơn giá phát lương theo suất" caption="Hai mức theo tình huống không bắt buộc nhập. Bảng hiển thị cấu hình có ngày áp dụng gần nhất, kể cả cấu hình cho tương lai."/>
      <div className="payment-table-scroll"><table className="payment-table"><thead><tr><th>Lớp / áp dụng từ</th>{fields.map(([key, label]) => <th key={key}>{label}</th>)}<th><span className="sr-only">Cấu hình</span></th></tr></thead><tbody>{classes.map(cls => {
        const rate = rates.find(row => row.class_id === cls.id);
        return <tr key={cls.id}><td data-label="Lớp / áp dụng từ"><strong>{cls.name}</strong><small className="payment-saved">{rate?.effective_date ? dateLabel(rate.effective_date) : rate ? 'Cấu hình hiện có' : 'Chưa cấu hình'}</small></td>{fields.map(([key, label]) => <td key={key} data-label={label}>{show(key, rate?.[key])}</td>)}<td><Button variant="secondary small" aria-label={`Cấu hình lương ${cls.name}`} onClick={() => edit(cls)}>Đặt đơn giá</Button>{!!rate?.pay_history?.length && <details><summary>Lịch sử đơn giá</summary>{rate.pay_history.map(rule => <div key={rule.effective_date}><p>{fields.map(([key, label]) => `${label}: ${show(key, rule[key])}`).join(' · ')}</p><Button variant="ghost small" onClick={() => edit(cls, rule)}>Sửa từ {dateLabel(rule.effective_date)}</Button></div>)}</details>}</td></tr>;
      })}</tbody></table></div>{!classes.length && <Empty title="Chưa có lớp phù hợp" text="Chọn lại bộ lọc hoặc tạo lớp trước khi cấu hình lương."/>}
      <p className="inset muted">Ưu tiên: đơn giá riêng → một người thay hai giáo viên → giáo viên không có trợ → giáo viên thông thường. Công đã chốt giữ nguyên khi đổi cấu hình. Tiền suất chỉ để đối chiếu ngân sách.</p>
    </section>}
    <RecalculatePay classId={classId}/>
  </div>;
}
