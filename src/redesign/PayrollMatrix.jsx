import { useState } from 'react';
import { api, jsonBody } from '../lib/api';
import { summarizePay } from '../../shared/payroll';
import { useCenter } from './center-context';
import { money, workStatus } from './format';
import { Button, Empty, Feedback, Select } from './ui';
import { buildPayrollMatrix } from './payroll-matrix';
import './payroll-matrix.css';

const displayDate = date => date.split('-').reverse().join('/');
const editablePay = row => row.source === 'personal' && row.status !== 'cancelled';

function PayCell({ row, time, className, edit }) {
  if (!row) return null;
  const amount = row.pay_amount == null ? 'Chưa định giá' : money(row.pay_amount);
  const tags = [
    row.status !== 'completed' && workStatus[row.status]?.[0],
    row.source === 'historic' && 'Công cũ',
    row.pay_basis === 'override' && 'Đơn giá riêng',
    row.staffing_warning && 'Cần soát đội hình',
  ].filter(Boolean);
  const content = <>
    <span className="matrix-cell-time">{time}</span>
    <strong>{row.teacherName}</strong>
    <span className="matrix-cell-amount">{amount}</span>
    {!!tags.length && <small>{tags.join(' · ')}</small>}
  </>;
  return editablePay(row)
    ? <button type="button" className="matrix-entry matrix-entry-editable"
        aria-label={`Sửa tiền công ${row.teacherName}, ${className}, ${displayDate(row.date)}, ${time}, ${amount}`}
        onClick={() => edit(row, className)}>{content}</button>
    : <div className="matrix-entry">{content}</div>;
}

export default function PayrollMatrix() {
  const d = useCenter();
  const [classId, setClassId] = useState('');
  const records = classId ? d.work.filter(row => String(row.classId) === classId) : d.work;
  const classes = classId ? d.classes.filter(cls => String(cls.id) === classId) : d.classes;
  const { groups, rows } = buildPayrollMatrix(d.month, classes, records);
  const confirmed = records.filter(row => row.status === 'completed');
  const total = summarizePay(confirmed);
  const edit = (row, name) => {
    const amountLabel = row.status === 'draft' ? 'Tiền dự kiến hiện tại' : 'Tiền công hiện tại';
    d.open({
      title: 'Sửa tiền một lượt công',
      initial: { amount: row.override_amount ?? row.pay_amount ?? '', reason: row.override_reason || '' },
      content: <dl className="detail-dl">
        <dt>Nhân sự</dt><dd>{row.teacherName} · {row.role}</dd>
        <dt>Buổi dạy</dt><dd>{name} · {displayDate(row.date)} · {row.start}–{row.end}</dd>
        <dt>{amountLabel}</dt><dd>{row.pay_amount == null ? 'Chưa định giá' : money(row.pay_amount)}</dd>
      </dl>,
      fields: [
        { key: 'amount', label: 'Tiền công mới (đồng)', type: 'number', min: 0, max: 99999999999999, required: true, full: true },
        { key: 'reason', label: 'Lý do điều chỉnh', type: 'textarea', required: true, maxLength: 1000, full: true, rows: 2 },
      ],
      submit: 'Lưu tiền công',
      footer: 'Mức này áp dụng riêng cho lượt công đang chọn.',
      save: async values => {
        await api(`/api/classes/${row.classId}/personal-attendance/${row.entryId}/pay`, jsonBody({
          version: row.version, amount: Number(values.amount), reason: values.reason.trim(),
        }, 'PATCH'));
        await d.refreshWork();
        d.notify('Đã cập nhật tiền công.');
      },
    });
  };

  return <section aria-labelledby="payroll-matrix-title">
    <div className="matrix-toolbar">
      <div>
        <h2 id="payroll-matrix-title">Bảng công theo lớp</h2>
        <p className="muted">Chọn ô có người dạy để sửa tiền của lượt công đó. Cuộn ngang để xem thêm lớp.</p>
      </div>
      <div className="filters">
        <label className="inline-date">Tháng<input type="month" value={d.month} onChange={e => e.target.value && d.setMonth(e.target.value)}/></label>
        <Select label="Lớp" value={classId} onChange={e => setClassId(e.target.value)}>
          <option value="">Tất cả lớp</option>{d.classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
        </Select>
        <Button variant="secondary" disabled={d.workLoading} onClick={() => d.refreshWork()}>Tải lại</Button>
      </div>
    </div>
    <Feedback error={d.workError} retry={() => d.refreshWork()}/>
    {d.workLoading ? <p role="status">Đang tải bảng công…</p> : !d.workError && <>
      <p className="matrix-summary"><strong>{confirmed.length} lượt đã xác nhận · {money(total.amount)}</strong>
        {total.missing > 0 && <span> · {total.missing} lượt chưa định giá</span>}
        {!!d.legacy.length && <span> · Công cũ thiếu giờ xem trong Tổng công toàn trung tâm</span>}
      </p>
      {!groups.length ? <Empty title="Chưa có lớp để lập bảng công"/> : <div className="matrix-scroll" role="region" aria-label="Bảng công theo ngày và lớp" tabIndex={0}>
        <table className="payroll-matrix">
          <caption className="sr-only">Bảng công tháng {d.month}</caption>
          <thead>
            <tr><th className="matrix-date" rowSpan={2} scope="col">Ngày</th>
              {groups.map(group => <th key={group.id} colSpan={group.teachers + group.assistants} scope="colgroup">{group.name}</th>)}
            </tr>
            <tr>{groups.flatMap(group => [
              ...Array.from({ length: group.teachers }, (_, i) => `GV${i + 1}`),
              ...Array.from({ length: group.assistants }, (_, i) => group.assistants === 1 ? 'TG' : `TG${i + 1}`),
            ].map((label, i) => <th key={`${group.id}-${label}`} scope="col" className={i === 0 ? 'matrix-class-start' : ''}>{label}</th>))}</tr>
          </thead>
          {rows.map(day => <tbody key={day.date}>
            {Array.from({ length: day.slotCount }, (_, rowIndex) => <tr key={rowIndex}>
              {rowIndex === 0 && <th scope="rowgroup" rowSpan={day.slotCount} className="matrix-date">{displayDate(day.date)}</th>}
              {groups.flatMap((group, i) => {
                const slot = day.classSlots[i][rowIndex];
                const entries = [
                  ...Array.from({ length: group.teachers }, (_, index) => slot?.teachers[index]),
                  ...Array.from({ length: group.assistants }, (_, index) => slot?.assistants[index]),
                ];
                return entries.map((row, index) => <td key={`${group.id}-${index}`} className={index === 0 ? 'matrix-class-start' : ''}>
                  <PayCell row={row} time={slot?.time} className={group.name} edit={edit}/>
                </td>);
              })}
            </tr>)}
          </tbody>)}
          <tfoot><tr>
            <th className="matrix-date" scope="row">Đã xác nhận</th>
            {groups.map(group => <td key={group.id} colSpan={group.teachers + group.assistants}>
              {money(group.total || 0)}{group.missing > 0 && <small> · {group.missing} lượt chưa định giá</small>}
            </td>)}
          </tr></tfoot>
        </table>
      </div>}
    </>}
  </section>;
}
