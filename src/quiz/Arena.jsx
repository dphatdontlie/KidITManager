import { roundChallenge } from '../../shared/quiz';

export function TeamEmblem({ teamId = 0 }) {
  return <span className="arena-emblem" data-team={teamId % 6} aria-hidden="true"><svg viewBox="0 0 48 52" fill="none"><path d="M24 3 44 11v17c0 9-12 17-20 21C16 45 4 37 4 28V11L24 3Z" fill="currentColor"/><path d="m24 11 12 5v12c0 5-7 11-12 14-5-3-12-9-12-14V16l12-5Z" stroke="#101c34" strokeWidth="2"/></svg><b>{teamId + 1}</b></span>;
}

export function ArenaArt() {
  return <svg className="arena-art" viewBox="0 0 520 340" fill="none" aria-hidden="true"><ellipse cx="270" cy="283" rx="210" ry="34" fill="#0b1326"/><path d="m48 206 202-101 228 112-203 101L48 206Z" fill="#294268"/><path d="m48 206 227 110v-27L48 179v27Z" fill="#14233f"/><path d="m275 289 203-100v28L275 318v-29Z" fill="#385579"/><path d="m48 179 201-101 229 111-203 100L48 179Z" fill="#537da4"/><path d="m91 178 158-79 186 90-160 79-184-90Z" fill="#153548"/><path d="m120 178 130-64 153 74-129 65-154-75Z" stroke="#8ed6c7" strokeWidth="3" strokeDasharray="7 8"/><path d="m205 165 47-24 72 35-47 24-72-35Z" fill="#f6bf56"/><path d="M205 165v28l72 35v-28l-72-35Z" fill="#b77b2a"/><path d="m277 200 47-24v28l-47 24v-28Z" fill="#e1a644"/><path d="M252 141V91" stroke="#f3e4c4" strokeWidth="5"/><path d="m255 90 48 12-48 18V90Z" fill="#ff8068"/><path d="M126 174v-52M384 190v-52" stroke="#c7e5ef" strokeWidth="5"/><path d="m129 122 38 10-38 15v-25Z" fill="#80d8c8"/><path d="m387 138 38 10-38 15v-25Z" fill="#9bb6ff"/><path d="M96 228v-51m0-9v-15M415 249v-49m0-9v-15" stroke="#13233e" strokeWidth="8" strokeLinecap="round"/><path d="m186 63 18 10-18 10-18-10 18-10ZM378 62l20 10-20 10-20-10 20-10Z" fill="#8ca5ce"/><path d="m190 45 12 6-12 6-12-6 12-6ZM338 29l9 5-9 5-9-5 9-5Z" fill="#f6bf56"/><circle cx="73" cy="100" r="4" fill="#80d8c8"/><circle cx="443" cy="116" r="4" fill="#ff8068"/></svg>;
}

export function ArenaIntro({ join = false }) {
  return <section className="arena-intro"><div><span className="arena-edition">KidIT Arena / Đấu trường kiến thức</span><h1>{join ? <>Kiến thức của bạn.<br/><em>Sức mạnh của đội.</em></> : <>Một lớp học.<br/><em>Một cuộc đua lớn.</em></>}</h1><p>{join ? 'Chọn đáp án, tích điểm, mở kỹ năng. Cùng đồng đội chinh phục từng vòng đấu.' : 'Biến bộ câu hỏi thành cuộc đua giữa các đội. Bạn cầm nhịp trận đấu, cả lớp cùng nhập cuộc.'}</p><div className="arena-intro-rules"><span><b>01</b> Trả lời câu hỏi</span><span><b>02</b> Mở kỹ năng</span><span><b>03</b> Về đích cùng đội</span></div></div><ArenaArt/></section>;
}

export function ChallengeTrail({ room }) {
  if (room.phase === 'lobby') return null;
  return <nav className="arena-trail" aria-label="Hành trình trận đấu">{Array.from({ length: room.questionCount }, (_, index) => {
    const challenge = roundChallenge(room.mode, index, room.questionCount, room.seconds);
    const state = index < room.index || room.phase === 'finished' ? 'complete' : index === room.index ? 'current' : 'ahead';
    return <span key={index} className={`arena-stage ${state} ${challenge.kind}`} aria-current={state === 'current' ? 'step' : undefined} title={`Câu ${index + 1}: ${challenge.name} · ${challenge.points} điểm`}><b>{index + 1}</b><small>{challenge.kind === 'final' ? 'Quyết định' : challenge.kind === 'sprint' ? 'Tăng tốc' : ''}</small></span>;
  })}</nav>;
}

export function RaceBoard({ room }) {
  const max = Math.max(100, ...room.teams.map(team => team.score));
  const leaders = room.teams.filter(team => team.score > 0 && team.score === Math.max(...room.teams.map(row => row.score)));
  return <section className="arena-race" aria-label="Đường đua điểm số"><header><div><span>Đường đua đồng đội</span><h3>{room.phase === 'lobby' ? 'Sẵn sàng xuất phát' : room.phase === 'finished' ? 'Đã cán đích!' : 'Mỗi câu đúng, tiến một bước.'}</h3></div><p>{room.playerCount} người chơi{leaders.length > 0 && <> · {leaders.length > 1 ? 'Đồng dẫn đầu: ' : 'Dẫn đầu: '}<b>{leaders.map(team => team.name).join(', ')}</b></>}</p></header><div className="arena-lanes">{room.teams.map(team => <div className="arena-lane" key={team.id} data-team={team.id}><div className="arena-lane-label"><span>{team.name}</span><strong>{team.score}<small> điểm</small></strong></div><div className="arena-track"><span className="arena-track-fill" style={{ width: `${team.score / (max + 100) * 100}%` }}/><span className="arena-runner" style={{ left: `${Math.min(87, team.score / (max + 100) * 87)}%` }}><TeamEmblem teamId={team.id}/></span><span className="arena-finish-line" aria-hidden="true"/></div></div>)}</div></section>;
}

export function MatchFinale({ room, me }) {
  const ordered = [...room.teams].sort((a, b) => b.score - a.score);
  const best = ordered[0]?.score || 0;
  const winners = ordered.filter(team => team.score === best);
  return <section className="arena-finale"><div className="arena-finale-title"><span>Hoàn thành hành trình</span><h2>{room.playerCount ? `${winners.map(team => team.name).join(' & ')} chiến thắng!` : 'Trận đấu đã khép lại'}</h2><p>{me ? `${me.name} · ${me.score || 0} điểm cá nhân` : `${room.questionCount} câu hỏi · ${room.playerCount} người chơi · ${room.teams.length} đội`}</p></div><div className="arena-podium">{ordered.map(team => <div key={team.id} data-team={team.id} className={team.score === best ? 'winner' : ''}><TeamEmblem teamId={team.id}/><span>Hạng {1 + ordered.filter(other => other.score > team.score).length}</span><h3>{team.name}</h3><strong>{team.score}<small> điểm</small></strong></div>)}</div></section>;
}
