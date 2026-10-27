import { useEffect, useRef, useState } from 'react';
import { Search, X, Check, CircleAlert, BookOpen, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { initials, workStatus, invoiceStatus } from './format';
import AttendancePicker from './AttendancePicker';
import { DateFields } from '../components/DateFields';
import { SCHEDULE_DAYS, TIME_SLOTS } from './schedule';
import { WEEKDAYS } from '../../shared/class-schedule';

export function Icon({ icon: Component, ...props }) { return <Component size={19} strokeWidth={1.8} aria-hidden="true" {...props} />; }
export function Button({ children, variant = '', icon, className = '', ...props }) { return <button type="button" className={`button ${variant} ${className}`} {...props}>{icon && <Icon icon={icon} />}{children}</button>; }
export function Avatar({ name, large = false }) { return <span className={`avatar ${large ? 'large' : ''}`} aria-hidden="true">{initials(name)}</span>; }
export function Badge({ value, type = 'work' }) { const [label, tone] = (type === 'work' ? workStatus : invoiceStatus)[value] || ['Chưa cập nhật', 'neutral']; return <span className={`badge ${tone}`}>{tone === 'good' && <Icon icon={Check} size={13} />}{label}</span>; }
export function Empty({ title = 'Chưa có dữ liệu', text = 'Thử đổi bộ lọc hoặc thêm bản ghi đầu tiên.', action }) { return <div className="empty"><Icon icon={BookOpen} size={30} /><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function Feedback({ error, retry }) { return error ? <div className="feedback-error" role="alert"><Icon icon={CircleAlert} /><span>{error}</span>{retry && <Button variant="ghost small" onClick={retry}>Thử lại</Button>}</div> : null; }
export function PageHead({ title, description, children }) { return <header className="page-head"><div><h1>{title}</h1><p>{description}</p></div>{children && <div className="head-actions">{children}</div>}</header>; }
export function PanelHead({ title, caption, children }) { return <div className="panel-head"><div><h2>{title}</h2>{caption && <p>{caption}</p>}</div>{children}</div>; }
export function Find({ value, onChange, placeholder = 'Tìm theo tên...' }) { return <label className="find"><Icon icon={Search} /><input aria-label={placeholder} placeholder={placeholder} type="search" value={value} onChange={e => onChange(e.target.value)} />{value && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => onChange('')}><Icon icon={X} size={16} /></button>}</label>; }
export function Select({ label, children, ...props }) { return <label className="filter-select"><span>{label}</span><select aria-label={label} {...props}>{children}</select></label>; }
export function ClassTag({ cls }) { return cls ? <Link className="class-tag" to={`/classes/${cls.id}`}>{cls.name}</Link> : null; }

export function EditDialog({ model, close }) {
  const ref = useRef(null); const [values, setValues] = useState(model.initial || {});
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const previous = document.activeElement; const dialog = ref.current; dialog.showModal(); return () => { dialog.close(); previous?.focus(); }; }, []);
  const fields = typeof model.fields === 'function' ? model.fields(values) : model.fields;
  const setField = (field, value) => { setValues(v => ({ ...v, [field.key]: value, ...(field.resetSlot && v[field.key] !== value ? { slot: '' } : {}), ...((field.resetSlot || field.key === 'slot') && v[field.key] !== value ? { teacher_count: undefined, ta_count: undefined } : {}) })); setError(''); };
  return <dialog ref={ref} className={`dialog ${model.wide ? 'wide' : ''}`} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); if (!busy) close(); }} onClick={e => { if (e.target === ref.current && !busy) close(); }}>
    <div className="dialog-head"><div><p className="muted">{model.caption || 'KidIT Manager'}</p><h2 id="dialog-title">{model.title}</h2></div><button disabled={busy} type="button" className="icon-button" aria-label="Đóng hộp thoại" onClick={close}><Icon icon={X} /></button></div>
    <form onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      if (fields?.some(f => f.required && typeof values[f.key] === 'string' && !values[f.key].trim())) { setError('Hãy nhập đủ các trường bắt buộc.'); return; }
      const message = model.validate?.(values); if (message) { setError(message); return; }
      setBusy(true); setError('');
      try { await model.save?.(values); close(); } catch (err) { setError(err.message); } finally { setBusy(false); }
    }}>
      {model.content && <div className="dialog-content">{model.content}</div>}
      <fieldset className="dialog-fields" disabled={busy}>
        {fields && <div className="form-grid">{fields.map(f => f.type === 'effective-date' ? <div className="full" key={f.key}><DateFields label={f.label} value={values[f.key] || ''} onChange={value => setField(f, value)} disabled={busy}/><small>{f.help}</small></div> : f.type === 'scheduled-date' ? <div className="full" key={f.key}><AttendancePicker label={f.label} schedule={f.schedule} scheduleHistory={f.scheduleHistory} savedDate={f.savedDate} disabled={busy || (!f.schedule && !f.scheduleHistory?.length && !f.savedDate)} value={values[f.key] || ''} onChange={value => setField(f, value)} />{!f.schedule && !f.scheduleHistory?.length && !f.savedDate && <p className="picker-help">Chọn lớp để hiện các buổi học có sẵn.</p>}</div> : <label key={f.key} className={f.full ? 'full' : ''}>{f.label}{f.required && <span className="required"> *</span>}
          {f.type === 'display' ? <output>{f.text}</output> : f.type === 'select' ? <select aria-label={f.label} required={f.required} disabled={f.readOnly} value={values[f.key] ?? f.displayValue ?? ''} onChange={e => setField(f, e.target.value)}>{f.options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}</select> : f.type === 'textarea' ? <textarea aria-label={f.label} required={f.required} rows={f.maxLength > 2000 ? 7 : 3} maxLength={f.maxLength || 2000} value={values[f.key] || ''} onChange={e => setField(f, e.target.value)} /> : <input aria-label={f.label} required={f.required} readOnly={f.readOnly} min={f.min} max={f.max} step={f.type === 'number' ? 1 : undefined} maxLength={f.maxLength || 255} type={f.type || 'text'} autoComplete={f.type === 'password' ? 'new-password' : 'off'} value={values[f.key] ?? ''} placeholder={f.placeholder} onChange={e => setField(f, e.target.value)} />}
          {f.help && <small>{f.help}</small>}</label>)}</div>}
        {model.scheduleEditor && <fieldset className="class-schedule-editor">
          <legend>Lịch học và phân công theo suất</legend>
          <p className="muted">Thêm từng người và chọn vai trò trong suất này. Một suất có thể có nhiều giáo viên hoặc trợ giảng. Vai trò được chọn chỉ áp dụng cho suất này.</p>
          {values.scheduleRows.map((row, index) => {
            const update = patch => setField({ key: 'scheduleRows' }, values.scheduleRows.map((s, i) => i === index ? { ...s, ...patch } : s));
            return <div className="schedule-editor-row" key={index}>
              <label>Thứ<select aria-label={`Thứ của suất ${index + 1}`} value={row.day} onChange={e => update({ day: Number(e.target.value) })}>{SCHEDULE_DAYS.map(day => <option key={day} value={day}>{WEEKDAYS[day]}</option>)}</select></label>
              <label>Suất học<select aria-label={`Giờ của suất ${index + 1}`} value={row.time} onChange={e => update({ time: e.target.value })}>{[...new Set([...TIME_SLOTS, row.time])].sort().map(time => <option key={time} value={time}>{time.replace('-', ' - ')}</option>)}</select></label>
              <div className="slot-people">
                {row.staff.map((person, personIndex) => {
                  const updatePerson = patch => update({ staff: row.staff.map((p, i) => i === personIndex ? { ...p, ...patch } : p) });
                  return <div className="slot-person" key={personIndex}>
                    <label>Nhân sự {personIndex + 1}<select aria-label={`Nhân sự ${personIndex + 1} của suất ${index + 1}`} value={person.name} onChange={e => updatePerson({ name: e.target.value })}><option value="">Chọn nhân sự</option>{model.staffOptions(person.name).filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                    <label>Vai trò trong suất<select aria-label={`Vai trò nhân sự ${personIndex + 1} của suất ${index + 1}`} value={person.role} onChange={e => updatePerson({ role: e.target.value })}><option value="teacher">Giáo viên</option><option value="ta">Trợ giảng</option></select></label>
                    <Button variant="ghost" onClick={() => update({ staff: row.staff.filter((_, i) => i !== personIndex) })}>Bỏ người {personIndex + 1} khỏi suất {index + 1}</Button>
                  </div>;
                })}
                {!row.staff.length && <p className="muted">Chưa phân công nhân sự.</p>}
                <Button variant="secondary" disabled={row.staff.length >= 20} onClick={() => update({ staff: [...row.staff, { name: '', role: 'teacher' }] })}>Thêm nhân sự cho suất {index + 1}</Button>
              </div>
              <Button variant="ghost" onClick={() => setField({ key: 'scheduleRows' }, values.scheduleRows.filter((_, i) => i !== index))}>Bỏ suất {index + 1}</Button>
            </div>;
          })}
          <Button variant="secondary" icon={Plus} onClick={() => setField({ key: 'scheduleRows' }, [...values.scheduleRows, { day: 1, time: '15:15-17:15', staff: [] }])}>Thêm suất học</Button>
        </fieldset>}
      </fieldset>
      {error && <div className="error-note" role="alert"><Icon icon={CircleAlert} />{error}</div>}
      <div className="dialog-footer"><span>{model.footer || 'Thông tin được lưu vào hệ thống khi xác nhận.'}</span><Button variant="secondary" disabled={busy} onClick={close}>{model.save ? 'Hủy' : 'Đóng'}</Button>{model.save && <Button type="submit" disabled={busy} icon={Check}>{busy ? 'Đang lưu...' : model.submit || 'Lưu thông tin'}</Button>}</div>
    </form>
  </dialog>;
}
