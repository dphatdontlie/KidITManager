import { useEffect, useState } from 'react';
import { blankQuestion, phaseLabel, SAMPLE_QUESTIONS } from '../../shared/quiz';
import { Leaderboard, Question, QuizError, RoomHeading, SkillLog } from './QuizShared';
import { quizRequest, readQuizStorage, useQuizRoom, writeQuizStorage } from './useQuizRoom';
import './quiz.css';
import { QuizAudio } from './QuizAudio';
import { ArenaIntro, MatchFinale, RaceBoard } from './Arena';
import './arena.css';

function QuizEditor({ created }) {
  const [title, setTitle] = useState('Đấu trường kiến thức');
  const [teamCount, setTeamCount] = useState(2);
  const [seconds, setSeconds] = useState(25);
  const [mode, setMode] = useState('adventure');
  const [questions, setQuestions] = useState([blankQuestion()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);
  useEffect(() => { let active = true; quizRequest('/api/quiz/rooms').then(data => { if (active) setRecent(data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const changeQuestion = (i, patch) => setQuestions(items => items.map((q, index) => index === i ? { ...q, ...patch } : q));
  return <div className="quiz-editor">
    <ArenaIntro/>
    <div className="arena-launch-bar"><span>Phòng của giáo viên · Tự soạn tối đa 30 câu hỏi</span><a className="quiz-link" href="/play" target="_blank" rel="noreferrer">Mở màn hình tham gia của học sinh</a></div>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { const room = await quizRequest('/api/quiz/rooms', { title, teamCount, seconds, mode, questions }); created(room.code); } catch (err) { setError(err.message); } finally { setBusy(false); } }}>
      <div className="arena-mode-picker" role="group" aria-label="Chế độ trận đấu"><button type="button" disabled={busy} aria-pressed={mode==='adventure'} onClick={()=>setMode('adventure')}><span>Hành trình thử thách</span><strong>Tăng tốc. Tích chuỗi. Bứt phá.</strong><small>Câu thường 100 điểm · vòng tăng tốc tối đa 15 giây, 150 điểm · câu cuối 200 điểm · mỗi chuỗi 3 câu đúng thưởng 50 điểm.</small></button><button type="button" disabled={busy} aria-pressed={mode==='classic'} onClick={()=>setMode('classic')}><span>Đấu đội cổ điển</span><strong>Cùng nhịp, cùng luật.</strong><small>Mỗi câu đúng 100 điểm; giữ nguyên thời gian mỗi câu. Vẫn có đóng băng, cầu lửa và lá chắn.</small></button></div>
      <fieldset disabled={busy} className="quiz-fieldset"><legend>Thiết lập trận đấu</legend><div className="quiz-settings"><label>Tên trận<input required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /></label><label>Số đội<select value={teamCount} onChange={e => setTeamCount(Number(e.target.value))}>{[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} đội</option>)}</select></label><label>Giây mỗi câu<input required type="number" min={10} max={120} value={seconds} onChange={e => setSeconds(Number(e.target.value))} /></label></div>
      <div className="quiz-editor-heading"><div><h3>Bộ câu hỏi · {questions.length}/30</h3><p className="quiz-muted">Mỗi câu có 4 lựa chọn. Đánh dấu đáp án đúng bên dưới.</p></div><button type="button" className="quiz-button quiz-secondary" onClick={() => setQuestions(structuredClone(SAMPLE_QUESTIONS))}>Dùng 4 câu mẫu Tin học</button></div>
      {questions.map((q, i) => <section key={i} className="quiz-edit-question" aria-label={`Soạn câu ${i + 1}`}><div className="quiz-edit-heading"><h3>Câu {i + 1}</h3><button className="quiz-link" type="button" disabled={questions.length === 1} onClick={() => setQuestions(items => items.filter((_, index) => index !== i))}>Xóa câu {i + 1}</button></div><label>Nội dung câu hỏi<textarea required maxLength={600} rows={2} value={q.text} onChange={e => changeQuestion(i, { text: e.target.value })} /></label>
        <div className="quiz-option-editor">{q.options.map((o, j) => <div key={j}><label className="quiz-correct-radio"><input type="radio" name={`correct-${i}`} checked={q.correct === j} onChange={() => changeQuestion(i, { correct: j })} /><span>{'ABCD'[j]} đúng</span></label><label><span className="sr-only">Câu {i + 1} đáp án {'ABCD'[j]}</span><input required maxLength={200} value={o} onChange={e => changeQuestion(i, { options: q.options.map((v, index) => index === j ? e.target.value : v) })} /></label></div>)}</div>
      </section>)}
      <div className="quiz-actions"><button type="button" className="quiz-button quiz-secondary" disabled={questions.length >= 30} onClick={() => setQuestions(items => [...items, blankQuestion()])}>Thêm câu hỏi</button><button type="submit" className="quiz-button">{busy ? 'Đang tạo phòng...' : 'Tạo phòng đấu'}</button></div></fieldset>
      <QuizError>{error}</QuizError>
    </form>
    <section className="quiz-rules"><h3>Kỹ năng thay đổi cục diện</h3><p>Đội có tỉ lệ đúng cao nhất mỗi vòng nhận 1 lượt kỹ năng, tối đa giữ 3 lượt. Đội trưởng dùng kỹ năng trong câu tiếp theo; đòn tấn công tác động lên cả đội đối thủ.</p><div className="arena-skill-guide"><p><b>Đóng băng</b>Khóa trả lời của đối thủ 3 giây.</p><p><b>Cầu lửa</b>Che vùng đáp án đối thủ 4 giây.</p><p><b>Lá chắn</b>Chặn một đòn tấn công.</p></div><p>Sau mỗi đòn, đội được bảo vệ 8 giây. Tối đa 80 người chơi; phòng giữ trong 24 giờ.</p></section>
    {recent.length > 0 && <section className="quiz-recent"><h3>Phòng của bạn trong 24 giờ qua</h3>{recent.map(room => <button type="button" key={room.code} className="quiz-recent-room" onClick={() => created(room.code)}><strong>{room.title}</strong><span>{room.code} · {phaseLabel(room.phase)}</span><span>Mở phòng</span></button>)}</section>}
  </div>;
}

function HostRoom({ code, exit }) {
  const { room, error, busy, act, now, stale } = useQuizRoom(code, null, true);
  const [notice, setNotice] = useState('');
  const [confirmFinish, setConfirmFinish] = useState(false);
  if (!room) return <section className="quiz-panel"><p role="status">Đang tải phòng {code}...</p><QuizError>{error}</QuizError><button className="quiz-button quiz-secondary" onClick={exit}>Về danh sách phòng</button></section>;
  const url = `${window.location.origin}/play/${room.code}`;
  const control = action => act('action', { action });
  return <div className="quiz-host-room"><RoomHeading room={room}><QuizAudio room={room} now={now} stale={stale} /></RoomHeading>
    <QuizError>{error}</QuizError>{stale && <p className="quiz-notice" role="status">Đang kết nối lại với phòng. Các nút điều khiển sẽ mở khi kết nối ổn định.</p>}
    <div className="quiz-share"><p>Học sinh mở <a className="quiz-link" href={url} target="_blank" rel="noreferrer">{url}</a>, nhập tên và tham gia.</p><button className="quiz-button quiz-secondary" onClick={async () => { try { await navigator.clipboard.writeText(url); setNotice('Đã sao chép link tham gia.'); } catch { setNotice('Không sao chép được. Hãy chọn link phía trên và sao chép thủ công.'); } }}>Sao chép link</button>{notice && <p role="status">{notice}</p>}</div>
    <div className="quiz-controlbar"><div className="quiz-actions">
      {(room.phase === 'lobby' || room.phase === 'reveal') && <button className="quiz-button" disabled={busy || stale || room.teams.some(t => !t.members.length)} onClick={() => control('next')}>{room.phase === 'lobby' ? 'Bắt đầu trận đấu' : room.index + 1 >= room.questionCount ? 'Xem kết quả chung cuộc' : 'Mở câu tiếp theo'}</button>}
      {room.phase === 'question' && <button className="quiz-button" disabled={busy || stale} onClick={() => control('reveal')}>Đóng câu và công bố đáp án</button>}
      {room.phase === 'lobby' && <button className="quiz-button quiz-secondary" disabled={busy || stale || !room.playerCount} onClick={() => control('shuffle')}>Chia lại đội ngẫu nhiên</button>}
      {room.phase !== 'finished' && !confirmFinish && <button className="quiz-button quiz-secondary" onClick={() => setConfirmFinish(true)}>Kết thúc trận sớm</button>}
      {room.phase === 'finished' && <button className="quiz-button" onClick={exit}>Soạn trận mới</button>}
      <button className="quiz-link" onClick={exit}>Về danh sách phòng</button>
      <button className="quiz-button quiz-secondary" onClick={async e=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await e.currentTarget.closest('.quiz-app').requestFullscreen();}catch{setNotice('Trình duyệt không mở được toàn màn hình. Bạn vẫn có thể chơi trong cửa sổ hiện tại.');}}}>Toàn màn hình / thu nhỏ</button>
    </div>{confirmFinish && room.phase !== 'finished' && <div className="quiz-confirm" role="group" aria-label="Xác nhận kết thúc"><p>Kết thúc trận với điểm hiện tại?</p><button className="quiz-button" disabled={busy || stale} onClick={async () => { if (await control('finish')) setConfirmFinish(false); }}>Xác nhận kết thúc</button><button className="quiz-button quiz-secondary" onClick={() => setConfirmFinish(false)}>Tiếp tục chơi</button></div>}</div>
    {room.phase === 'lobby' && <p className="quiz-notice">Đang chờ học sinh vào phòng. Mỗi đội cần ít nhất một bạn để bắt đầu. Bạn có thể đổi đội bằng ô chọn cạnh tên.</p>}
    {room.phase === 'finished' ? <MatchFinale room={room}/> : room.phase==='lobby'&&<RaceBoard room={room}/>}
    <div className={`quiz-host-layout ${room.phase === 'lobby' ? 'quiz-lobby' : ''}`}><div>{room.phase !== 'lobby' && <Question room={room} now={now} />}<SkillLog room={room} /></div><aside>{room.phase!=='lobby'&&room.phase!=='finished'&&<RaceBoard room={room}/>}<Leaderboard room={room} lobby={room.phase === 'lobby'} busy={busy || stale} move={(playerId, teamId) => act('action', { action: 'move', playerId, teamId })} /></aside></div>
  </div>;
}

export function QuizHost() {
  const [code, setCode] = useState(() => readQuizStorage('kidit-quiz-host'));
  const select = value => { setCode(value); writeQuizStorage('kidit-quiz-host', value); };
  return <div className="quiz-app">{code ? <HostRoom key={code} code={code} exit={() => select('')} /> : <QuizEditor created={select} />}</div>;
}
