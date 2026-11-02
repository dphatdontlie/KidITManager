import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, jsonBody } from '../lib/api';
import { useCenter } from './center-context';
import { PageHead, Button, Feedback } from './ui';
import './assistant.css';

const examples = ['Hôm nay có những lớp nào, ai dạy và ở phòng nào?', 'Tuần này có suất đã kết thúc nào chưa ghi nhận bài học?', 'Tôi muốn tìm lịch bổ sung cho một lớp. Bạn cần thông tin gì?'];

export default function Assistant() {
  const { role } = useCenter();
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [reload, setReload] = useState(0);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null); const field = useRef(null); const latest = useRef(null);
  useEffect(() => {
    if (role !== 'admin') return;
    const controller = new AbortController(); setStatusError(''); setStatus(null);
    api('/api/assistant/status', { signal: controller.signal }).then(setStatus).catch(e => { if (!controller.signal.aborted) setStatusError(e.message); });
    return () => controller.abort();
  }, [role, reload]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (messages.length) latest.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  if (role !== 'admin') return <section className="panel assistant-setup"><h1>Trợ lý điều phối</h1><p>Chức năng dành cho quản trị viên.</p><Link className="text-link" to="/">Về tổng quan</Link></section>;

  const submit = async event => {
    event.preventDefault();
    if (!question.trim() || busy || !status?.configured) return;
    const message = question.trim(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      const history = [];
      let size = 0;
      for (let i = messages.length - 2; i >= 0 && history.length < 8; i -= 2) {
        const pair = messages.slice(i, i + 2).map(({ role, content }) => ({ role, content: content.slice(0, 8000) }));
        const length = pair.reduce((n, m) => n + m.content.length, 0);
        if (size + length > 20000) break;
        history.unshift(...pair); size += length;
      }
      const result = await api('/api/assistant/chat', { ...jsonBody({ message, history }), signal: controller.signal });
      setMessages(previous => [...previous, { role: 'user', content: message }, { role: 'assistant', content: result.answer, sources: result.sources, checkedAt: result.checked_at }]);
      setQuestion('');
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); field.current?.focus(); }
    }
  };

  return <div className="assistant-page">
    <PageHead title="Trợ lý điều phối" description="Hỏi lịch, tra bài học từng suất và tìm phương án học bổ sung.">
      <Button variant="secondary" disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(''); field.current?.focus(); }}>Cuộc trò chuyện mới</Button>
    </PageHead>
    <Feedback error={statusError} retry={() => setReload(n => n + 1)}/>
    {!status && !statusError && <p role="status">Đang kiểm tra kết nối trợ lý...</p>}
    {status && !status.configured && <section className="panel assistant-setup" aria-labelledby="assistant-setup-title">
      <h2 id="assistant-setup-title">Chưa kết nối dịch vụ AI</h2>
      <p>Với OpenRouter, cấu hình <code>AI_PROVIDER=openrouter</code>, <code>OPENROUTER_API_KEY</code> và <code>OPENROUTER_MODEL</code> trên máy chủ, sau đó khởi động lại API hoặc triển khai lại web.</p>
      <p>Khóa API được giữ trên máy chủ. Không nhập khóa vào câu hỏi.</p>
      <Button variant="secondary" onClick={() => setReload(n => n + 1)}>Kiểm tra lại kết nối</Button>
    </section>}
    <section className="panel assistant-chat" aria-label="Hỏi đáp điều phối">
      <div className="assistant-scope"><p>Tra cứu dữ liệu mới khi gửi câu hỏi. Phương án lịch chưa được lưu.</p><small>Chưa có bản ghi bài học không đồng nghĩa chưa dạy. Lịch không trùng chỉ dựa trên dữ liệu đã ghi nhận.</small></div>
      {!messages.length && <div className="assistant-empty"><h2>Bạn muốn kiểm tra việc gì?</h2><p>Ghi rõ tên lớp và ngày cần xem để nhận kết quả cụ thể.</p><div className="assistant-examples">{examples.map(text => <button type="button" key={text} disabled={!status?.configured || busy} onClick={() => { setQuestion(text); field.current?.focus(); }}>{text}</button>)}</div></div>}
      <div className="assistant-messages" role="log" aria-label="Nội dung trò chuyện" aria-live="polite" aria-relevant="additions">
        {messages.map((m, index) => <article className={`assistant-message ${m.role}`} key={index}>
          <h3>{m.role === 'user' ? 'Bạn' : 'Trợ lý KidIT'}</h3><p className="assistant-answer">{m.content}</p>
          {m.checkedAt && <small>Dữ liệu tra lúc {new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(m.checkedAt))}</small>}
          {!!m.sources?.length && <details><summary>Nguồn đã tra cứu ({m.sources.length})</summary><ul>{m.sources.map((source, i) => <li key={i}><Link to={source.href}>{source.label}</Link></li>)}</ul></details>}
        </article>)}
        <div ref={latest}/>
      </div>
      <Feedback error={error}/>
      {busy && <p className="assistant-pending" role="status">Đang tra dữ liệu và soạn câu trả lời...</p>}
      <form className="assistant-compose" onSubmit={submit}>
        <label htmlFor="assistant-question">Câu hỏi của bạn</label>
        <textarea ref={field} id="assistant-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} rows={3} required disabled={!status?.configured || busy} placeholder="Ví dụ: Lớp Scratch chiều thứ Bảy vừa rồi ghi nhận bài học gì?" aria-describedby="assistant-input-help"/>
        <div className="assistant-compose-actions"><small id="assistant-input-help">Tối đa 2.000 ký tự. Mỗi lần tra tối đa 31 ngày.</small><div>{busy && <Button variant="secondary" onClick={() => request.current?.abort()}>Dừng</Button>}<button type="submit" className="button" disabled={!status?.configured || busy || !question.trim()}>Gửi câu hỏi</button></div></div>
      </form>
    </section>
  </div>;
}
