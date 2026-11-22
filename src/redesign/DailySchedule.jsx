import { Link } from 'react-router-dom';
import { DateFields } from '../components/DateFields';
import { localDate } from '../lib/api';
import { dateLabel } from './format';
import { weekdayLabel } from '../../shared/class-schedule';
import { lessonHref, scheduleBlocksOnDate, shiftScheduleDate } from './schedule';
import { Button, Empty } from './ui';
import './daily-schedule.css';

export default function DailySchedule({ blocks, date, onDateChange }) {
  const entries = scheduleBlocksOnDate(blocks, date);
  const times = [...new Set(entries.map(entry => entry.timeKey))];
  const previous = shiftScheduleDate(date, -1);
  const next = shiftScheduleDate(date, 1);
  return <section className="daily-schedule" aria-label="Thời khóa biểu theo ngày">
    <div className="daily-schedule-controls">
      <DateFields label="Ngày xem thời khóa biểu" value={date} onChange={onDateChange}/>
      <div className="daily-schedule-buttons">
        <Button variant="secondary" disabled={!previous} onClick={() => onDateChange(previous)}>Ngày trước</Button>
        <Button variant="secondary" onClick={() => onDateChange(localDate())}>Hôm nay</Button>
        <Button disabled={!next} onClick={() => onDateChange(next)}>Ngày sau</Button>
      </div>
    </div>
    <div className="daily-schedule-heading" aria-live="polite" aria-atomic="true">
      <h2>{date ? `${weekdayLabel(date)}, ${dateLabel(date)}` : 'Nhập ngày, tháng, năm để xem lịch'}</h2>
      {date && <p>{new Set(entries.map(entry => entry.classId)).size} lớp · {entries.length} suất học theo bộ lọc</p>}
    </div>
    {!date ? <Empty title="Chưa chọn ngày hợp lệ" text="Nhập đủ ngày, tháng, năm hoặc bấm Hôm nay."/> : entries.length ? <table className="daily-timetable">
      <caption className="sr-only">Thời khóa biểu {dateLabel(date)}</caption>
      <thead><tr><th scope="col">Suất học</th><th scope="col">Lớp trong ngày</th></tr></thead>
      <tbody>{times.map(time => <tr key={time}>
        <th scope="row"><span>{time.split('-')[0]}</span><span>{time.split('-')[1]}</span></th>
        <td><div className="daily-class-list">{entries.filter(entry => entry.timeKey === time).map(entry => <Link className="daily-class" key={entry.id} to={lessonHref(entry.classId,entry.date,entry.timeKey)}>
          <strong>{entry.className}</strong><span>GV: {entry.teacher}</span><span>TG: {entry.ta || 'Chưa phân công'}</span><small>{entry.room ? /^phòng\b/iu.test(entry.room) ? entry.room : `Phòng ${entry.room}` : 'Chưa xếp phòng'}</small>
        </Link>)}</div></td>
      </tr>)}</tbody>
    </table> : <Empty title="Ngày này không có lớp theo bộ lọc" text="Chuyển ngày khác hoặc chọn tất cả giáo viên để xem lịch."/>}
  </section>;
}
