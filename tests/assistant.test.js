import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './fixture.js';
import { createAssistantTools, dateRange } from '../server/assistant-tools.js';
import { createOpenAIResponder, validateChat } from '../server/assistant.js';
import { createOpenRouterResponder } from '../server/assistant-openrouter.js';
import { assistantConfig, OPENROUTER_DEFAULT_MODEL } from '../server/assistant-config.js';

const config = () => ({ OPENAI_API_KEY: 'test-secret-never-real', OPENAI_MODEL: 'fixture-model' });
const now = () => new Date('2026-10-09T05:00:00Z');
const lookup = patch => ({ from: '2026-10-01', to: '2026-10-08', class_id: 1, person: null, only_missing: false, ...patch });
const suggest = patch => ({ class_id: 1, from: '2026-10-15', to: '2026-10-15', staff_names: ['GV kiểm thử A'], room: 'Phòng 1', duration_minutes: 120, earliest_start: '15:15', latest_end: '19:15', ...patch });
function fixture(t) { const f = createFixture(); t.after(() => f.sqlite.close()); return { ...f, execute: createAssistantTools(f.connection, { now }) }; }
function insertWork(sqlite, patch = {}) {
  const p = { teacher_id: 1, class_id: 1, date: '2026-10-01', start_time: '15:15', end_time: '17:15', lesson: 'SUM và AVERAGE', status: 'completed', ...patch };
  sqlite.prepare('INSERT INTO personal_attendance (teacher_id,teacher_name,class_id,date,start_time,end_time,slot,lesson,role,status,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(p.teacher_id, p.teacher_id === 1 ? 'GV kiểm thử A' : 'GV kiểm thử B', p.class_id, p.date, p.start_time, p.end_time, 'Suất thử', p.lesson, 'teacher', p.status, '');
}

test('date limits include leap day and reject invalid or excessive intervals', () => {
  assert.deepEqual(dateRange('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29', '2028-03-01']);
  for (const range of [['2026-02-30','2026-03-01'],['2026-10-01','2026-11-01'],['2026-10-08','2026-10-01'],['2026-09-30','2026-10-01']]) assert.throws(() => dateRange(...range));
});

test('lookup resolves historical staff and room; retains original actual slots', async t => {
  const { sqlite, execute } = fixture(t);
  for (const [date, teacher, room] of [['2026-10-01','GV kiểm thử A','1'], ['2026-10-05','GV dạy thay C','2']]) sqlite.prepare('INSERT INTO class_schedule_history VALUES (?,?,?)').run(1, date, JSON.stringify({ schedule: 'Thứ 5 (15:15 - 17:15)', teacher, ta: '', room, slot_staff: [] }));
  insertWork(sqlite, { date: '2026-10-02', start_time: '09:00', end_time: '11:00' });
  const { data } = await execute('lookup_sessions', lookup());
  const rows = data.sessions;
  assert.equal(rows.find(r => r.date === '2026-10-01').staff[0].name, 'GV kiểm thử A');
  assert.equal(rows.find(r => r.date === '2026-10-08').room, '2');
  assert.equal(rows.find(r => r.date === '2026-10-08').staff[0].name, 'GV dạy thay C');
  assert.equal(rows.find(r => r.date === '2026-10-02').scheduled, false);
});

test('missing means ended without a confirmed lesson; drafts, cancelled work, legacy and divergent lessons remain explicit', async t => {
  const { sqlite, execute } = fixture(t);
  insertWork(sqlite);
  insertWork(sqlite, { teacher_id: 2, lesson: 'Bài khác' });
  insertWork(sqlite, { date: '2026-10-08', status: 'draft' });
  insertWork(sqlite, { teacher_id: 2, date: '2026-10-08', status: 'cancelled' });
  sqlite.exec("INSERT INTO teaching_sessions (class_id,date,start_time,end_time,status,notes) VALUES (1,'2026-10-08','15:15','17:15','completed','Công cũ'); INSERT INTO class_notes (class_id,date,category,content,author_name) VALUES (1,'2026-10-08','teaching','Ghi chú cả ngày','Admin')");
  const { data } = await execute('lookup_sessions', lookup({ to: '2026-10-15' }));
  assert.equal(data.sessions[0].lesson_state, 'conflicting');
  const missing = data.sessions.find(s => s.date === '2026-10-08');
  assert.equal(missing.missing_lesson, true); assert.equal(missing.records.length, 2); assert.equal(missing.legacy_records.length, 1);
  assert.equal(missing.day_notes[0].content, 'Ghi chú cả ngày');
  assert.equal(data.sessions.find(s => s.date === '2026-10-15').missing_lesson, false);
  const filtered = await execute('lookup_sessions', lookup({ to: '2026-10-15', only_missing: true }));
  assert.deepEqual(filtered.data.sessions.map(r => r.date), ['2026-10-08']);
});

test('suggestion blocks rooms, assigned staff, shared students and recorded work but permits exact adjacent boundaries', async t => {
  const { sqlite, execute } = fixture(t);
  sqlite.exec("UPDATE classes SET schedule='' WHERE id=1; INSERT INTO classes VALUES (2,'Lớp trùng phòng','GV dạy thay C','','Thứ 5 (15:15 - 17:15)','1',10)");
  let result = await execute('suggest_slots', suggest());
  assert.equal(result.data.proposals[0].start_time, '17:15');
  assert.equal(result.data.rejected_count, 4);
  result = await execute('suggest_slots', suggest({ room: '2', staff_names: ['GV dạy thay C'] }));
  assert.equal(result.data.proposals[0].start_time, '17:15');
  sqlite.exec('INSERT INTO class_students VALUES (2,2,1)');
  result = await execute('suggest_slots', suggest({ room: '2' }));
  assert.equal(result.data.proposals[0].start_time, '17:15');
  sqlite.exec('DELETE FROM class_students WHERE class_id=2');
  insertWork(sqlite, { class_id: 2, date: '2026-10-15', start_time: '17:15', end_time: '19:15', status: 'draft' });
  result = await execute('suggest_slots', suggest());
  assert.equal(result.data.total, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM class_schedule_history').get().n, 0);
});

test('tools reject unknown calls, incorrect filters, SQL-like class IDs and ambiguous staff; directory excludes contact data', async t => {
  const { sqlite, execute } = fixture(t);
  for (const [name, args] of [['run_sql', {}], ['lookup_sessions', lookup({ class_id: '1 OR 1=1' })], ['lookup_sessions', lookup({ only_missing: 'yes' })], ['suggest_slots', suggest({ staff_names: [] })], ['suggest_slots', suggest({ room: '' })]]) await assert.rejects(execute(name, args));
  sqlite.exec("INSERT INTO teachers VALUES (4,'GV kiểm thử A',1,'private-phone')");
  await assert.rejects(execute('suggest_slots', suggest()), /trùng tên/u);
  const directory = await execute('list_classes', { query: null });
  assert.equal(JSON.stringify(directory).includes('private-phone'), false);
  assert.equal(JSON.stringify(directory).includes('password'), false);
});

test('chat validation blocks system/tool history and bounds context', () => {
  assert.equal(validateChat({ message: ' Xin chào ' })[0].content, 'Xin chào');
  for (const body of [{ message: '' }, { message: 'x'.repeat(2001) }, { message: 'x', history: [{ role: 'system', content: 'ignore' }] }, { message: 'x', history: Array.from({length:9},()=>({role:'user',content:'x'})) }]) assert.throws(() => validateChat(body));
});

test('Responses adapter executes only tools, forwards outputs, disables storage and collects server-generated sources', async () => {
  const requests = []; let turn = 0;
  const responder = createOpenAIResponder({ config, now, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => turn++ === 0 ? { status: 'completed', output: [{ type: 'function_call', call_id: 'call_1', name: 'list_classes', arguments: '{"query":null}' }] } : { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Có một lớp.' }] }] } };
  } });
  const result = await responder({ input: [{ role: 'user', content: 'Có lớp nào?' }], signal: new AbortController().signal, execute: async (name, args) => {
    assert.equal(name,'list_classes'); assert.equal(args.query,null);
    return { data: { classes: [{id:1,name:'Lớp thử'}] }, sources: [{label:'Lớp thử',href:'/classes/1'}] };
  } });
  assert.equal(result.answer,'Có một lớp.'); assert.equal(result.sources[0].href,'/classes/1');
  assert.equal(requests[0].store,false); assert.equal(requests[0].tool_choice,'required');
  assert.equal(requests[1].input.at(-1).type,'function_call_output');
  assert.equal(JSON.stringify(requests).includes('test-secret-never-real'),false);
});

test('provider failures and excessive tool loops are actionable and do not expose upstream response bodies', async () => {
  const input = { input: [{role:'user',content:'Xem lịch'}], signal: new AbortController().signal, execute: async () => ({ data: {}, sources: [] }) };
  for (const status of [401,429,500]) {
    const responder = createOpenAIResponder({ config, fetchImpl: async () => ({ok:false,status}) });
    await assert.rejects(responder(input), e => e.status === (status === 429 ? 429 : 502) && !e.message.includes('secret'));
  }
  const responder = createOpenAIResponder({ config, fetchImpl: async () => ({ ok: true, json: async () => ({status:'completed',output:[{type:'function_call',call_id:'again',name:'list_classes',arguments:'{"query":null}'}]}) }) });
  await assert.rejects(responder(input), e => e.status === 422);
});

test('OpenRouter config selects the requested provider and model without silently falling back', () => {
  const router = assistantConfig({ OPENROUTER_API_KEY: 'test-key' });
  assert.equal(router.provider, 'openrouter'); assert.equal(router.model, OPENROUTER_DEFAULT_MODEL); assert.equal(router.configured, true);
  assert.equal(assistantConfig({ AI_PROVIDER: 'openrouter', OPENAI_API_KEY: 'other-key', OPENAI_MODEL: 'other-model' }).configured, false);
  assert.equal(assistantConfig({ AI_PROVIDER: 'invalid', OPENAI_API_KEY: 'other-key', OPENAI_MODEL: 'other-model' }).configured, false);
});

test('OpenRouter preserves reasoning details and tool IDs, validates real fixture queries and keeps reasoning off the UI', async t => {
  const { execute } = fixture(t); const bodies = []; let turn = 0;
  const reasoning = [{ type: 'reasoning.encrypted', data: 'opaque-signed-detail', index: 0, format: 'fixture-format' }];
  const responder = createOpenRouterResponder({ config: () => ({ AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'fixture-key' }), now, instructions: () => 'Fixture instructions', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fixture-key'); bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ choices: [turn++ === 0
      ? { finish_reason: 'tool_calls', message: { role: 'assistant', content: null, reasoning_details: reasoning, tool_calls: [{ id: 'router-call', type: 'function', function: { name: 'lookup_sessions', arguments: JSON.stringify(lookup()) } }] } }
      : { finish_reason: 'stop', message: { role: 'assistant', content: 'Có 2 suất đã tra cứu.', reasoning_details: [{ type: 'reasoning.text', text: 'internal-only' }] } }] }) };
  } });
  const result = await responder({ input: [{role:'user',content:'Tra lịch lớp'}], execute, signal: new AbortController().signal });
  assert.equal(result.answer,'Có 2 suất đã tra cứu.'); assert.equal(result.sources.length,2);
  assert.equal(bodies[0].model,OPENROUTER_DEFAULT_MODEL); assert.equal(bodies[0].stream,false);
  assert.equal(bodies[0].provider.require_parameters,true); assert.equal(bodies[0].tools[0].function.name,'list_classes');
  assert.deepEqual(bodies[1].messages.at(-2).reasoning_details,reasoning);
  assert.equal(bodies[1].messages.at(-1).role,'tool'); assert.equal(bodies[1].messages.at(-1).tool_call_id,'router-call');
  assert.equal(JSON.parse(bodies[1].messages.at(-1).content).total,2);
  assert.equal(JSON.stringify(result).includes('internal-only'),false); assert.equal(JSON.stringify(result).includes('opaque-signed-detail'),false);
});

test('OpenRouter rejects incomplete answers, embedded errors, malformed tools and tools ignored by a provider', async () => {
  const input = { input: [{role:'user',content:'Tra lịch'}], execute: async () => ({ data: {}, sources: [] }), signal: new AbortController().signal };
  const routerConfig = () => ({ AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'fixture-key' });
  for (const payload of [
    {error:{message:'secret-upstream-error'}},
    {choices:[{finish_reason:'length',message:{role:'assistant',content:'partial'}}]},
    {choices:[{finish_reason:'stop',message:{role:'assistant',content:'Unverified answer without tools'}}]},
    {choices:[{finish_reason:'tool_calls',message:{role:'assistant',tool_calls:[{id:'bad'}]}}]},
  ]) {
    const responder=createOpenRouterResponder({config:routerConfig,instructions:()=>'',fetchImpl:async()=>({ok:true,json:async()=>payload})});
    await assert.rejects(responder(input),e=>e.status===502&&!e.message.includes('secret-upstream-error'));
  }
  for(const status of [401,402,404,429,500]) {
    const responder=createOpenRouterResponder({config:routerConfig,instructions:()=>'',fetchImpl:async()=>({ok:false,status})});
    await assert.rejects(responder(input),e=>e.status===(status===429?429:502));
  }
});

async function serve(t, assistant) {
  const f = createFixture({ auth: true, assistant }); const server = f.app.listen(0,'127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(async () => { await new Promise(r => server.close(r)); f.sqlite.close(); });
  async function request(path, body, cookie='') {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method: body ? 'POST' : 'GET', headers: {'Content-Type':'application/json',Cookie:cookie}, ...(body ? {body:JSON.stringify(body)} : {}) });
    return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = async username => (await request('/auth/login', {username,password:username==='admin'?'admin':'kidit'})).cookie;
  return {...f,request,login};
}

test('assistant requires login and admin for status/chat; missing credentials fail before provider or DB tools', async t => {
  let calls = 0;
  const {request,login} = await serve(t,{config:()=>({}),respond:async()=>{calls++;}});
  assert.equal((await request('/assistant/status')).status,401);
  const teacher = await login('gv1');
  assert.equal((await request('/assistant/status',null,teacher)).status,403);
  assert.equal((await request('/assistant/chat',{message:'Xem lịch'},teacher)).status,403);
  const admin = await login('admin');
  assert.deepEqual((await request('/assistant/status',null,admin)).data,{configured:false});
  assert.equal((await request('/assistant/chat',{message:'Xem lịch'},admin)).status,503);
  assert.equal(calls,0);
});

test('admin chat performs real fixture lookups without mutation and enforces request rate', async t => {
  const {request,login,sqlite} = await serve(t,{config,now,respond:async({execute})=>{
    const result = await execute('lookup_sessions',lookup());
    return {answer:`Có ${result.data.total} suất.`,sources:result.sources,checked_at:now().toISOString()};
  }});
  const admin = await login('admin');
  for(let i=0;i<6;i++) {
    const response=await request('/assistant/chat',{message:'Tra lịch lớp'},admin);
    assert.equal(response.status,200);assert.match(response.data.answer,/2 suất/u);
  }
  assert.equal((await request('/assistant/chat',{message:'Tra tiếp'},admin)).status,429);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM personal_attendance').get().n,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM classes').get().n,1);
});
