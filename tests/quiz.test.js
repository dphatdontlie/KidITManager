import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './fixture.js';
import { answerQuestion, createRoom, hostAction, joinRoom, roomView, settleRoom, useSkill } from '../server/quiz-domain.js';

const setup = (patch = {}) => ({ title: 'Trận kiểm thử', teamCount: 2, seconds: 25, questions: [
  { text: '2 + 2 = ?', options: ['3', '4', '5', '6'], correct: 1 },
  { text: '3 + 3 = ?', options: ['4', '5', '6', '7'], correct: 2 },
  { text: '4 + 4 = ?', options: ['6', '7', '8', '9'], correct: 2 },
], ...patch });

test('adventure challenges enforce deadlines, hidden rewards, combo scoring and final points on the server', () => {
  const questions = Array.from({ length: 4 }, () => ({ text: 'Câu kiểm thử', options: ['A', 'B', 'C', 'D'], correct: 1 }));
  const room = createRoom(setup({ mode: 'adventure', questions }), 0);
  const a = joinRoom(room, 'An', 'a'), b = joinRoom(room, 'Bình', 'b');
  let now = 1000;
  for (let index = 0; index < 4; index++) {
    hostAction(room, { action: 'next' }, now);
    const before = roomView(room, '123456', now, a);
    assert.equal(before.seconds, index === 2 ? 15 : 25);
    assert.equal(room.deadline, now + before.seconds * 1000);
    answerQuestion(room, a, { index, choice: 1, points: 99999, bonus: 99999 }, now + 100);
    const hidden = roomView(room, '123456', now + 100, a);
    assert.deepEqual(hidden.me.answer, { choice: 1 });
    assert.equal(hidden.me.score, index === 0 ? 0 : index === 1 ? 100 : index === 2 ? 200 : 400);
    answerQuestion(room, b, { index, choice: 0 }, now + 200);
    const reveal = roomView(room, '123456', now + 200, a);
    assert.equal(reveal.me.answer.points, [100, 100, 200, 200][index]);
    assert.equal(reveal.me.streak, index + 1);
    if (index === 2) assert.equal(reveal.me.answer.bonus, 50);
    now += 30000;
  }
  assert.equal(roomView(room, '123456', now, a).me.score, 600);
  const sprint = createRoom(setup({ mode: 'adventure', questions }), 0);
  const p = joinRoom(sprint, 'A', 'a'); joinRoom(sprint, 'B', 'b');
  sprint.phase = 'reveal'; sprint.index = 1;
  hostAction(sprint, { action: 'next' }, 1000);
  assert.throws(() => answerQuestion(sprint, p, { index: 2, choice: 1 }, 16000), /đã đóng/);
  assert.throws(() => createRoom(setup({ mode: 'unknown' }), 0), /Chế độ/);
});

async function serve(t) {
  let time = 100000;
  const fixture = createFixture({ auth: true, quizNow: () => time });
  const server = fixture.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fixture.sqlite.close(); });
  const request = async (path, body, { cookie = '', token = '' } = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  };
  const cookie = (await request('/auth/login', { username: 'gv1', password: 'kidit' })).cookie;
  const host = async (path = '', body) => request(`/quiz/rooms${path}`, body, { cookie });
  const code = (await host('', setup())).data.code;
  const join = async name => (await request(`/play/${code}/join`, { name })).data;
  const player = (token, path = '', body) => request(`/play/${code}${path}`, body, { token });
  const action = async action => host(`/${code}/action`, { action });
  return { ...fixture, request, host, code, join, player, action, advance: ms => { time += ms; } };
}

test('students enter without a teacher account, room secrets stay private and ownership is enforced', async t => {
  const f = await serve(t);
  assert.equal((await f.request('/quiz/rooms')).status, 401);
  assert.equal((await f.request('/classes')).status, 401);
  const a = await f.join('An');
  assert.equal(a.room.me.name, 'An');
  assert.equal((await f.request(`/play/${f.code}`)).status, 403);
  assert.equal((await f.request(`/play/${f.code}`, undefined, { token: '0'.repeat(64) })).status, 403);
  assert.equal((await f.request(`/play/${f.code}/join`, { name: 'AN' })).status, 409);
  const bCookie = (await f.request('/auth/login', { username: 'gv2', password: 'kidit' })).cookie;
  assert.equal((await f.request(`/quiz/rooms/${f.code}`, undefined, { cookie: bCookie })).status, 403);
  assert.equal((await f.request(`/quiz/rooms/${f.code}/action`, { action: 'finish' }, { cookie: bCookie })).status, 403);
  assert.deepEqual((await f.request('/quiz/rooms', undefined, { cookie: bCookie })).data, []);
  const data = JSON.stringify(a.room);
  assert.ok(!data.includes('tokenHash') && !data.includes('questions') && !data.includes('correct'));
  assert.ok(!f.sqlite.prepare('SELECT state FROM quiz_rooms WHERE code=?').get(f.code).state.includes(a.token));
});

test('simultaneous joins and answers preserve every player, reject duplicates and only reveal scores after closing', async t => {
  const f = await serve(t);
  const players = await Promise.all(['An', 'Bình', 'Chi', 'Dũng'].map(f.join));
  assert.equal(new Set(players.map(p => p.token)).size, 4);
  const lobby = (await f.host(`/${f.code}`)).data;
  assert.equal(lobby.playerCount, 4);
  assert.deepEqual(lobby.teams.map(team => team.members.length), [2, 2]);
  assert.equal((await f.action('next')).status, 200);
  const first = await f.player(players[0].token, '/answer', { index: 0, choice: 1 });
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.me.answer, { choice: 1 });
  assert.ok(first.data.teams.every(team => team.score === 0));
  assert.equal(first.data.question.correct, undefined);
  const duplicate = await Promise.all([0, 1].map(() => f.player(players[0].token, '/answer', { index: 0, choice: 1 })));
  assert.deepEqual(duplicate.map(r => r.status), [409, 409]);
  const rest = await Promise.all(players.slice(1).map(p => f.player(p.token, '/answer', { index: 0, choice: 1 })));
  assert.ok(rest.every(r => r.status === 200));
  const revealed = (await f.player(players[0].token)).data;
  assert.equal(revealed.phase, 'reveal');
  assert.equal(revealed.answered, 4);
  assert.deepEqual(revealed.teams.map(team => team.score), [200, 200]);
  assert.deepEqual(revealed.teams.map(team => team.charges), [1, 1]);
  assert.equal(revealed.question.correct, 1);
  assert.equal((await f.player(players[0].token)).data.me.answer.correct, true);
  assert.equal((await f.request(`/play/${f.code}/join`, { name: 'Vào muộn' })).status, 409);
});

test('captain skills apply across the opponent team, freeze is server enforced and shields block exactly one attack', async t => {
  const f = await serve(t);
  const players = [];
  for (const name of ['An', 'Bình', 'Chi', 'Dũng']) players.push(await f.join(name));
  await f.action('next');
  for (const p of players) await f.player(p.token, '/answer', { index: 0, choice: 1 });
  await f.action('next');
  assert.equal((await f.player(players[2].token, '/skill', { skill: 'freeze', targetId: 1, index: 1 })).status, 403);
  assert.equal((await f.player(players[0].token, '/skill', { skill: 'freeze', targetId: 0, index: 1 })).status, 400);
  assert.equal((await f.player(players[0].token, '/skill', { skill: 'freeze', targetId: 1, index: 0 })).status, 409);
  assert.equal((await f.player(players[0].token, '/skill', { skill: 'freeze', targetId: 1, index: 1 })).status, 200);
  for (const i of [1, 3]) {
    const view = (await f.player(players[i].token)).data;
    assert.equal(view.teams[1].effect.kind, 'freeze');
    assert.equal((await f.player(players[i].token, '/answer', { index: 1, choice: 2 })).status, 409);
  }
  f.advance(3100);
  assert.equal((await f.player(players[1].token, '/answer', { index: 1, choice: 2 })).status, 200);
  for (const i of [0, 2, 3]) await f.player(players[i].token, '/answer', { index: 1, choice: 2 });
  await f.action('next');
  assert.equal((await f.player(players[0].token, '/skill', { skill: 'shield', index: 2 })).status, 200);
  const shielded = await f.player(players[1].token, '/skill', { skill: 'fire', targetId: 0, index: 2 });
  assert.equal(shielded.status, 200);
  assert.equal(shielded.data.teams[0].shield, false);
  assert.equal(shielded.data.teams[0].effect, null);
  assert.equal(shielded.data.events.at(-1).blocked, true);
  assert.equal((await f.player(players[1].token, '/skill', { skill: 'fire', targetId: 0, index: 2 })).status, 409);
  f.advance(8100);
  assert.equal((await f.player(players[1].token, '/skill', { skill: 'fire', targetId: 0, index: 2 })).status, 200);
  assert.equal((await f.player(players[2].token)).data.teams[0].effect.kind, 'fire');
  f.advance(4100);
  assert.equal((await f.player(players[2].token)).data.teams[0].effect, null);
});

test('server deadlines survive reconnects, stale rounds reject submissions and rooms expire', async t => {
  const f = await serve(t);
  const a = await f.join('An'); await f.join('Bình');
  await f.action('next');
  f.advance(25001);
  assert.equal((await f.player(a.token, '/answer', { index: 0, choice: 1 })).status, 409);
  const room = (await f.player(a.token)).data;
  assert.equal(room.phase, 'reveal'); assert.deepEqual(room.result.winners, []);
  assert.equal((await f.host(`/${f.code}`)).data.phase, 'reveal');
  await f.action('next');
  assert.equal((await f.player(a.token, '/answer', { index: 0, choice: 2 })).status, 409);
  assert.equal((await f.player(a.token, '/answer', { index: 1, choice: 2 })).status, 200);
  assert.equal((await f.player(a.token)).data.me.answer.choice, 2);
  await f.action('finish');
  assert.equal((await f.player(a.token)).data.phase, 'finished');
  assert.equal((await f.player(a.token, '/answer', { index: 1, choice: 2 })).status, 409);
  f.advance(86400_000);
  assert.equal((await f.player(a.token)).status, 404);
});

test('an 80-player burst preserves every answer under concurrent room updates', async t => {
  const f = await serve(t);
  const joins = await Promise.all(Array.from({ length: 80 }, (_, i) => f.join(`Học sinh ${i + 1}`)));
  assert.ok(joins.every(join => join.token));
  assert.equal((await f.host(`/${f.code}`)).data.playerCount, 80);
  assert.equal((await f.request(`/play/${f.code}/join`, { name: 'Học sinh 81' })).status, 409);
  await f.action('next');
  const answers = await Promise.all(joins.map(join => f.player(join.token, '/answer', { index: 0, choice: 1 })));
  assert.ok(answers.every(answer => answer.status === 200), JSON.stringify(answers.filter(answer => answer.status !== 200)));
  const view = (await f.host(`/${f.code}`)).data;
  assert.equal(view.phase, 'reveal');
  assert.equal(view.answered, 80);
  assert.deepEqual(view.teams.map(team => team.score), [4000, 4000]);
});

test('full-length Vietnamese question sets fit the creation request limit', async t => {
  const f = await serve(t);
  const questions = Array.from({ length: 30 }, () => ({ text: 'ế'.repeat(600), options: Array(4).fill('ệ'.repeat(200)), correct: 0 }));
  const response = await f.host('', setup({ questions }));
  assert.equal(response.status, 201);
  assert.equal(response.data.questionCount, 30);
});

test('question validation, balanced assignment, normalized wins, charge caps and lobby controls', () => {
  for (const patch of [{ title: '' }, { teamCount: 1 }, { teamCount: 7 }, { seconds: 0 }, { questions: [] }, { questions: [{ text: 'X', options: ['', 'B', 'C', 'D'], correct: 0 }] }]) assert.throws(() => createRoom(setup(patch), 0));
  const room = createRoom(setup(), 0);
  assert.throws(() => hostAction(room, { action: 'next' }, 0));
  const a = joinRoom(room, 'A', 'a'); const b = joinRoom(room, 'B', 'b'); const c = joinRoom(room, 'C', 'c');
  assert.deepEqual(room.players.map(p => p.teamId), [0, 1, 0]);
  hostAction(room, { action: 'shuffle' }, 0);
  assert.equal(room.players.filter(p => p.teamId === 0).length, 2);
  hostAction(room, { action: 'move', playerId: a.id, teamId: 0 }, 0);
  hostAction(room, { action: 'move', playerId: b.id, teamId: 1 }, 0);
  hostAction(room, { action: 'move', playerId: c.id, teamId: 0 }, 0);
  hostAction(room, { action: 'next' }, 0);
  assert.throws(() => hostAction(room, { action: 'move', playerId: a.id, teamId: 1 }, 1));
  answerQuestion(room, a, { index: 0, choice: 1 }, 100);
  answerQuestion(room, b, { index: 0, choice: 1 }, 100);
  settleRoom(room, 25000);
  assert.deepEqual(room.results[0].winners, [1]);
  assert.equal(room.results[0].stats[0].ratio, 0.5);
  room.teams[1].charges = 3;
  hostAction(room, { action: 'next' }, 30000);
  answerQuestion(room, b, { index: 1, choice: 2 }, 31000);
  settleRoom(room, 55000);
  assert.equal(room.teams[1].charges, 3);
  hostAction(room, { action: 'next' }, 60000);
  assert.throws(() => useSkill(room, a, { skill: 'unknown', index: 2 }, 61000));
  settleRoom(room, 85000);
  hostAction(room, { action: 'next' }, 85000);
  assert.equal(room.phase, 'finished');
  assert.equal(roomView(room, '123456', 85000, a).teams[0].score, 100);
});
