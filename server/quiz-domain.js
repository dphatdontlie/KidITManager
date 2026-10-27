import { randomBytes, randomUUID, randomInt, createHash } from 'node:crypto';
import { InputError } from './session-domain.js';
import { roundChallenge } from '../shared/quiz.js';

export const tokenDigest = token => createHash('sha256').update(token).digest('hex');
export const newQuizToken = () => randomBytes(32).toString('hex');
const check = (condition, message, status = 400) => { if (!condition) throw new InputError(message, status); };

export function createRoom(body, now) {
  const { title, teamCount, seconds, questions, mode = 'classic' } = body || {};
  check(['classic', 'adventure'].includes(mode), 'Chế độ trận đấu không hợp lệ.');
  check(typeof title === 'string' && title.trim().length > 0 && title.length <= 100, 'Tên trận cần từ 1 đến 100 ký tự.');
  check(Number.isInteger(teamCount) && teamCount >= 2 && teamCount <= 6, 'Chọn từ 2 đến 6 đội.');
  check(Number.isInteger(seconds) && seconds >= 10 && seconds <= 120, 'Thời gian mỗi câu từ 10 đến 120 giây.');
  check(Array.isArray(questions) && questions.length >= 1 && questions.length <= 30, 'Bộ câu hỏi cần từ 1 đến 30 câu.');
  const normalized = questions.map((q, i) => {
    check(q && typeof q.text === 'string' && q.text.trim() && q.text.length <= 600, `Câu ${i + 1}: nhập nội dung, tối đa 600 ký tự.`);
    check(Array.isArray(q.options) && q.options.length === 4 && q.options.every(o => typeof o === 'string' && o.trim() && o.length <= 200), `Câu ${i + 1}: cần đủ 4 đáp án, mỗi đáp án tối đa 200 ký tự.`);
    check(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4, `Câu ${i + 1}: chọn đáp án đúng.`);
    return { text: q.text.trim(), options: q.options.map(o => o.trim()), correct: q.correct };
  });
  return {
    title: title.trim(), seconds, mode, questions: normalized, phase: 'lobby', index: -1, deadline: null,
    teams: Array.from({ length: teamCount }, (_, id) => ({ id, name: `Đội ${id + 1}`, charges: 0, shield: false, effect: null, protectedUntil: 0 })),
    players: [], results: [], events: [], createdAt: now,
  };
}

export function joinRoom(room, name, token) {
  check(room.phase === 'lobby', 'Trận đã bắt đầu, không nhận thêm người chơi.', 409);
  check(typeof name === 'string' && name.trim() && name.length <= 40, 'Tên học sinh cần từ 1 đến 40 ký tự.');
  check(room.players.length < 80, 'Phòng đã đủ 80 học sinh.', 409);
  check(!room.players.some(p => p.name.toLocaleLowerCase('vi') === name.trim().toLocaleLowerCase('vi')), 'Tên này đã có trong phòng. Hãy thêm tên lớp hoặc số để phân biệt.', 409);
  const team = [...room.teams].sort((a, b) => room.players.filter(p => p.teamId === a.id).length - room.players.filter(p => p.teamId === b.id).length)[0];
  const player = { id: randomUUID(), name: name.trim(), teamId: team.id, tokenHash: tokenDigest(token), answers: [] };
  room.players.push(player);
  return player;
}

export function settleRoom(room, now, force = false) {
  if (room.phase !== 'question' || (!force && now < room.deadline)) return false;
  const stats = room.teams.map(team => {
    const players = room.players.filter(p => p.teamId === team.id);
    const correct = players.filter(p => p.answers[room.index]?.correct).length;
    return { teamId: team.id, correct, total: players.length, ratio: players.length ? correct / players.length : 0 };
  });
  const best = Math.max(...stats.map(t => t.ratio));
  const winners = stats.filter(t => best > 0 && t.ratio === best).map(t => t.teamId);
  for (const team of room.teams) {
    if (winners.includes(team.id)) team.charges = Math.min(3, team.charges + 1);
    team.effect = null; team.shield = false; team.protectedUntil = 0;
  }
  room.results.push({ index: room.index, stats, winners });
  room.phase = 'reveal';
  return true;
}

export function hostAction(room, body, now) {
  const { action, playerId, teamId } = body || {};
  if (action === 'next') {
    check(room.phase === 'lobby' || room.phase === 'reveal', 'Hãy kết thúc câu hiện tại trước.', 409);
    check(room.teams.every(t => room.players.some(p => p.teamId === t.id)), 'Mỗi đội cần ít nhất một học sinh.');
    if (room.index + 1 >= room.questions.length) { room.phase = 'finished'; return; }
    room.index++; room.phase = 'question'; room.deadline = now + roundChallenge(room.mode, room.index, room.questions.length, room.seconds).seconds * 1000;
    for (const team of room.teams) { team.effect = null; team.shield = false; team.protectedUntil = 0; }
  } else if (action === 'reveal') {
    check(room.phase === 'question', 'Không có câu hỏi đang diễn ra.', 409);
    settleRoom(room, now, true);
  } else if (action === 'finish') {
    check(room.phase !== 'finished', 'Trận đã kết thúc.', 409);
    settleRoom(room, now, true); room.phase = 'finished';
  } else if (action === 'move') {
    check(room.phase === 'lobby', 'Chỉ đổi đội trước khi bắt đầu.', 409);
    const player = room.players.find(p => p.id === playerId);
    check(player && room.teams.some(t => t.id === teamId), 'Học sinh hoặc đội không tồn tại.');
    player.teamId = teamId;
  } else if (action === 'shuffle') {
    check(room.phase === 'lobby', 'Chỉ chia đội trước khi bắt đầu.', 409);
    const players = [...room.players];
    for (let i = players.length - 1; i > 0; i--) { const j = randomInt(i + 1); [players[i], players[j]] = [players[j], players[i]]; }
    players.forEach((p, i) => { p.teamId = i % room.teams.length; });
  } else {
    throw new InputError('Thao tác điều khiển không hợp lệ.');
  }
}

export function answerQuestion(room, player, body, now) {
  check(room.phase === 'question' && now < room.deadline, 'Câu hỏi đã đóng.', 409);
  check(body?.index === room.index, 'Câu hỏi đã thay đổi. Chờ đồng bộ rồi trả lời.', 409);
  check(Number.isInteger(body.choice) && body.choice >= 0 && body.choice < 4, 'Đáp án không hợp lệ.');
  check(!player.answers[room.index], 'Bạn đã trả lời câu này.', 409);
  const team = room.teams.find(t => t.id === player.teamId);
  check(!(team.effect?.kind === 'freeze' && team.effect.until > now), 'Đội đang bị đóng băng. Chờ hết hiệu ứng.', 409);
  const correct = body.choice === room.questions[room.index].correct;
  let streak = 0;
  for (let i = room.index - 1; i >= 0 && player.answers[i]?.correct; i--) streak++;
  const bonus = correct && room.mode === 'adventure' && (streak + 1) % 3 === 0 ? 50 : 0;
  const challenge = roundChallenge(room.mode, room.index, room.questions.length, room.seconds);
  player.answers[room.index] = { choice: body.choice, correct, points: correct ? challenge.points + bonus : 0, bonus, streak: correct ? streak + 1 : 0 };
  if (room.players.every(p => p.answers[room.index])) settleRoom(room, now, true);
}

export function useSkill(room, player, body, now) {
  check(room.phase === 'question' && now < room.deadline, 'Chỉ dùng kỹ năng khi câu hỏi đang mở.', 409);
  check(body?.index === room.index, 'Câu hỏi đã thay đổi. Chờ đồng bộ rồi dùng kỹ năng.', 409);
  const team = room.teams.find(t => t.id === player.teamId);
  check(room.players.find(p => p.teamId === team.id)?.id === player.id, 'Chỉ đội trưởng được dùng kỹ năng.', 403);
  check(team.charges > 0, 'Đội chưa có lượt kỹ năng.', 409);
  check(['freeze', 'fire', 'shield'].includes(body.skill), 'Kỹ năng không hợp lệ.');
  let target = team;
  let blocked = false;
  if (body.skill === 'shield') {
    check(!team.shield, 'Đội đã có lá chắn.', 409);
    team.shield = true;
  } else {
    target = room.teams.find(t => t.id === body.targetId);
    check(target && target.id !== team.id, 'Hãy chọn một đội đối thủ.');
    check(target.protectedUntil <= now, 'Đội này đang được bảo vệ sau đòn tấn công. Chọn đội khác hoặc chờ.', 409);
    blocked = target.shield;
    if (blocked) target.shield = false;
    else target.effect = { kind: body.skill, until: now + (body.skill === 'freeze' ? 3000 : 4000) };
    target.protectedUntil = now + 8000;
  }
  team.charges--;
  room.events.push({ id: randomUUID(), from: team.name, to: target.name, skill: body.skill, blocked, at: now });
  room.events = room.events.slice(-12);
}

export function roomView(room, code, now, player = null, host = false) {
  const revealed = room.phase === 'reveal' || room.phase === 'finished';
  const question = room.questions[room.index];
  const score = p => p.answers.reduce((sum, a, index) => sum + (a?.correct && (revealed || index < room.index) ? a.points ?? 100 : 0), 0);
  const challenge = roundChallenge(room.mode, room.index, room.questions.length, room.seconds);
  const streak = p => { let count = 0; for (let i = revealed ? room.index : room.index - 1; i >= 0 && p.answers[i]?.correct; i--) count++; return count; };
  return {
    code, title: room.title, phase: room.phase, index: room.index, questionCount: room.questions.length,
    mode: room.mode || 'classic', challenge, seconds: challenge.seconds, deadline: room.deadline, serverNow: now, me: player ? { id: player.id, name: player.name, teamId: player.teamId, score: score(player), streak: streak(player), answer: player.answers[room.index] ? { choice: player.answers[room.index].choice, ...(revealed ? { correct: player.answers[room.index].correct, points: player.answers[room.index].points ?? (player.answers[room.index].correct ? 100 : 0), bonus: player.answers[room.index].bonus || 0 } : {}) } : null } : null,
    question: question ? { text: question.text, options: question.options, ...(revealed ? { correct: question.correct } : {}) } : null,
    teams: room.teams.map(t => {
      const members = room.players.filter(p => p.teamId === t.id);
      return { id: t.id, name: t.name, charges: t.charges, shield: t.shield, effect: t.effect?.until > now ? t.effect : null, protectedUntil: t.protectedUntil,
        score: members.reduce((sum, p) => sum + score(p), 0), captainId: members[0]?.id,
        members: members.map(p => ({ id: p.id, name: p.name, score: score(p), answered: Boolean(p.answers[room.index]) })),
      };
    }),
    answered: room.players.filter(p => p.answers[room.index]).length, playerCount: room.players.length,
    result: revealed ? room.results.at(-1) || null : null,
    events: room.events, host,
  };
}
