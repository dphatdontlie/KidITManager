import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './fixture.js';
import { PRESENCE_TTL_MS } from '../server/staff-presence.js';

test('presence is private, deduplicates sessions, expires idle users and removes logged-out sessions', async t => {
  let now = Date.now();
  const { app, sqlite } = createFixture({ auth: true, presence: { now: () => now } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    sqlite.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, cookie = '', body = {}) => fetch(`${url}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
  });
  const login = async username => (await post('/auth/login', '', { username, password: 'kidit' })).headers.get('set-cookie').split(';')[0];
  const pulse = async cookie => {
    const response = await post('/presence', cookie, { id: 99, name: 'Ignored' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    return response.json();
  };

  assert.equal((await post('/presence')).status, 401);
  const first = await login('gv1');
  const second = await login('gv1');
  const colleague = await login('gv2');
  const a = { id: 2, name: 'GV kiểm thử A' };
  const b = { id: 3, name: 'GV kiểm thử B' };
  assert.deepEqual(await pulse(first), [a]);
  assert.deepEqual(await pulse(second), [a]);
  assert.deepEqual(await pulse(colleague), [a, b]);
  await post('/auth/logout', second);
  assert.deepEqual(await pulse(colleague), [a, b]);
  now += PRESENCE_TTL_MS + 1;
  assert.deepEqual(await pulse(colleague), [b]);
  assert.deepEqual(await pulse(first), [a, b]);
  await post('/auth/logout', first);
  assert.deepEqual(await pulse(colleague), [b]);
});
