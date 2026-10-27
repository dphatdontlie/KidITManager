import { useEffect } from 'react';
import { QUIZ_SKILLS, phaseLabel } from '../../shared/quiz';
import { ChallengeTrail, TeamEmblem } from './Arena';

export function QuizError({ children }) { return children ? <p className="quiz-error" role="alert">{children}</p> : null; }

export function RoomHeading({ room, children }) {
  return <><header className="quiz-room-heading"><div><p className="quiz-muted">{phaseLabel(room.phase)} · {room.playerCount} người chơi</p><h2>{room.title}</h2></div><div className="quiz-room-code"><span>Mã tham gia</span><strong>{room.code}</strong></div>{children}</header><ChallengeTrail room={room}/></>;
}

export function Leaderboard({ room, lobby = false, move, busy, me }) {
  const teams = lobby ? room.teams : [...room.teams].sort((a, b) => b.score - a.score);
  return <section className="quiz-standings" aria-label="Bảng điểm đội"><h3>{lobby ? 'Biệt đội đã tập hợp' : 'Bảng xếp hạng'}</h3><p className="quiz-muted">{lobby ? 'Người đầu danh sách là đội trưởng. Giáo viên có thể đổi đội trước khi xuất phát.' : 'Điểm cập nhật khi đóng câu. Cả đội cùng đóng góp vào kết quả.'}</p>
    <div className="quiz-team-list">{teams.map(team => <article className={`quiz-team ${me?.teamId === team.id ? 'quiz-my-team' : ''}`} key={team.id} data-team={team.id}>
      <header><TeamEmblem teamId={team.id}/><strong>{!lobby && <small>Hạng {1 + teams.filter(other => other.score > team.score).length} · </small>}{team.name}{me?.teamId === team.id && <small>Đội của bạn</small>}</strong><span>{team.score}<small> điểm</small></span></header>
      <p className="quiz-muted">{team.members.length} thành viên · {team.charges} lượt kỹ năng{team.shield && ' · Có lá chắn'}</p>{!team.members.length && <p className="quiz-muted">Đang chờ đồng đội tham gia.</p>}
      <ul>{team.members.map(p => <li key={p.id}><span>{p.name}{team.captainId === p.id && <small>Đội trưởng</small>}{!lobby && <small>{p.answered ? 'Đã trả lời' : room.phase === 'question' ? 'Đang suy nghĩ' : 'Chưa trả lời'}</small>}</span>{lobby && move ? <label className="quiz-move"><span className="sr-only">Đội của {p.name}</span><select disabled={busy} value={team.id} onChange={e => move(p.id, Number(e.target.value))}>{room.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label> : <span>{p.score} điểm</span>}</li>)}</ul>
    </article>)}</div>
  </section>;
}

export function Question({ room, now, me, answer, disabled }) {
  const revealed = room.phase !== 'question';
  const remaining = Math.max(0, Math.ceil((room.deadline - now) / 1000));
  useEffect(() => {
    if (!answer || disabled || revealed || me?.answer || !remaining) return;
    const choose = event => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,select,[contenteditable=true]')) return;
      if (/^[1-4]$/.test(event.key)) { event.preventDefault(); answer(Number(event.key) - 1); }
    };
    window.addEventListener('keydown', choose); return () => window.removeEventListener('keydown', choose);
  }, [answer, disabled, revealed, me?.answer, remaining]);
  if (!room.question) return null;
  const challenge = room.challenge || { name: 'Vòng kiến thức', points: 100, kind: 'classic' };
  return <section key={room.index} className={`quiz-question arena-question ${challenge.kind} ${remaining <= 5 && !revealed ? 'time-low' : ''}`} aria-label={`Câu hỏi ${room.index + 1}`}>
    <div className="quiz-question-meta"><span className="arena-round-label">Câu {room.index + 1}<small> / {room.questionCount}</small></span><span>{room.answered}/{room.playerCount} đã trả lời</span>{!revealed && <strong className="arena-timer" role="timer" aria-label={`Còn ${remaining} giây`}>{remaining}<small>giây</small></strong>}</div>
    {!revealed && <progress aria-label="Thời gian còn lại" max={room.seconds} value={remaining}/>}
    <div className="arena-challenge-label"><span>{challenge.name}</span><b>+{challenge.points} điểm / câu đúng</b></div><h2>{room.question.text}</h2>
    <div className="quiz-answers">{room.question.options.map((option, i) => {
      const correct = revealed && room.question.correct === i; const selected = me?.answer?.choice === i;
      return <button key={i} type="button" className={`quiz-answer answer-${i} ${correct ? 'quiz-correct' : ''} ${selected ? 'quiz-selected' : ''} ${revealed && selected && !correct ? 'quiz-wrong' : ''} ${revealed && !correct && !selected ? 'quiz-dimmed' : ''}`} disabled={!answer || disabled || revealed || Boolean(me?.answer) || remaining === 0} onClick={() => answer(i)} aria-pressed={selected}><span className="quiz-letter">{'ABCD'[i]}</span><span>{option}{correct && <small>Đáp án đúng</small>}{selected && <small>Bạn đã chọn</small>}</span><kbd>{i + 1}</kbd></button>;
    })}</div>
    {room.phase === 'question' && me?.answer && <div className="arena-answer-feedback waiting" role="status"><b>Đã khóa đáp án {'ABCD'[me.answer.choice]}!</b><span>Đội đang chờ kết quả. Bạn vẫn có thể hỗ trợ bằng kỹ năng.</span></div>}
    {revealed && me && <div key={`${room.index}-result`} className={`arena-answer-feedback ${me.answer?.correct ? 'success' : 'retry'}`} role="status"><b>{!me.answer ? 'Chưa kịp trả lời vòng này' : me.answer.correct ? `Chính xác! +${me.answer.points ?? 100} điểm` : 'Chưa đúng. Vòng sau gỡ lại nhé!'}</b><span>{me.answer?.bonus > 0 ? `Thưởng chuỗi ${me.streak} câu đúng: +${me.answer.bonus} điểm đã cộng trong kết quả.` : me.answer?.correct ? 'Điểm của bạn đã được cộng cho đội.' : 'Xem đáp án đúng phía trên trước khi sang vòng tiếp theo.'}</span></div>}
    {revealed && room.result && <div className="quiz-round-result"><h3>Kết quả vòng này</h3><div>{room.result.stats.map(stat => <p key={stat.teamId}><span>{room.teams.find(t => t.id === stat.teamId)?.name}</span><strong>{stat.correct}/{stat.total} đúng</strong><small>{room.result.winners.includes(stat.teamId) ? '+1 lượt kỹ năng' : `${Math.round(stat.ratio * 100)}% chính xác`}</small></p>)}</div><p className="quiz-muted">Đội cùng tỉ lệ đúng cao nhất đều nhận kỹ năng, tích trữ tối đa 3 lượt.</p></div>}
  </section>;
}

export function SkillLog({ room }) {
  if (!room.events.length) return null;
  return <section className="quiz-log"><h3>Nhật ký giao tranh</h3><ol>{[...room.events].reverse().slice(0, 5).map(e => <li key={e.id}>{e.from} dùng {QUIZ_SKILLS.find(s => s.id === e.skill)?.name.toLowerCase()}{e.skill === 'shield' ? ' để bảo vệ đội mình.' : ` lên ${e.to}.`}{e.blocked && ' Lá chắn đã chặn đòn!'}</li>)}</ol></section>;
}
