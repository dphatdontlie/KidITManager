import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateVAPIDKeys } from 'web-push';
import { validateSubscription, pushConfig } from '../server/push.js';
import { createFixture } from './fixture.js';

const keys = generateVAPIDKeys();
const env = { PUSH_VAPID_PUBLIC_KEY: keys.publicKey, PUSH_VAPID_PRIVATE_KEY: keys.privateKey, PUSH_VAPID_SUBJECT: 'mailto:admin@example.com' };
const subscription = { endpoint: 'https://web.push.apple.com/example-device', keys: { p256dh: generateVAPIDKeys().publicKey, auth: Buffer.alloc(16, 3).toString('base64url') } };
async function serve(t, overrides = {}) {
  const sent = [];
  const fixture = createFixture({ auth: true, push: { env, send: async (...args) => { sent.push(args); }, ...overrides } });
  const server = fixture.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fixture.sqlite.close(); });
  const request = async (path, body, cookie = '', method = body ? 'POST' : 'GET') => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = async (username) => (await request('/auth/login', { username, password: username === 'admin' ? 'admin' : 'kidit' })).cookie;
  return { ...fixture, request, login, sent };
}

test('push configuration rejects absent/invalid keys and never exposes a private key', async t => {
  assert.equal(pushConfig({}), null);
  assert.equal(pushConfig({ ...env, PUSH_VAPID_PRIVATE_KEY: 'bad' }), null);
  const f = await serve(t);
  assert.equal((await f.request('/push/config')).status, 401);
  const c = await f.login('gv1');
  assert.deepEqual((await f.request('/push/config', null, c)).data, { configured: true, publicKey: keys.publicKey, remindersRunning: false });
});
test('subscriptions reject arbitrary network targets and malformed encryption keys', () => {
  for (const endpoint of ['http://web.push.apple.com/x', 'https://127.0.0.1/x', 'https://web.push.apple.com.evil.test/x', 'https://web.push.apple.com:8443/x', 'https://user@web.push.apple.com/x']) {
    assert.throws(() => validateSubscription({ ...subscription, endpoint }));
  }
  assert.throws(() => validateSubscription({ ...subscription, keys: { auth: 'abc', p256dh: 'bad' } }));
  assert.deepEqual(validateSubscription(subscription), subscription);
});
test('register, send own test, rate limit, and unsubscribe', async t => {
  const f = await serve(t); const c = await f.login('gv1');
  assert.equal((await f.request('/push/subscriptions', subscription, c)).status, 200);
  assert.equal((await f.request('/push/subscriptions', subscription, c)).status, 200);
  assert.equal((await f.request('/push/status', subscription, c)).data.subscribed, true);
  assert.equal((await f.request('/push/test', subscription, c)).status, 200);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0][2].TTL, 60);
  assert.equal((await f.request('/push/test', subscription, c)).status, 429);
  assert.equal((await f.request('/push/subscriptions', subscription, c, 'DELETE')).status, 200);
  assert.equal((await f.request('/push/test', subscription, c)).status, 404);
});
test('another account or another login session cannot test or delete this subscription', async t => {
  const f = await serve(t); const c = await f.login('gv1');
  await f.request('/push/subscriptions', subscription, c);
  for (const other of [await f.login('gv2'), await f.login('gv1')]) {
    assert.equal((await f.request('/push/status', subscription, other)).data.subscribed, false);
    assert.equal((await f.request('/push/test', subscription, other)).status, 404);
    await f.request('/push/subscriptions', subscription, other, 'DELETE');
    assert.equal((await f.request('/push/status', subscription, c)).data.subscribed, true);
  }
});
test('logout removes subscriptions and prevents later sends', async t => {
  const f = await serve(t); const c = await f.login('gv1');
  await f.request('/push/subscriptions', subscription, c);
  await f.request('/auth/logout', {}, c);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n, 0);
  assert.equal((await f.request('/push/test', subscription, c)).status, 401);
  assert.equal(f.sent.length, 0);
});
test('expired push endpoints are removed; transient failures retain registration', async t => {
  for (const statusCode of [410, 503]) {
    await t.test(String(statusCode), async t => {
      const f = await serve(t, { send: async () => { throw { statusCode }; } });
      const c = await f.login('gv1');
      await f.request('/push/subscriptions', subscription, c);
      assert.equal((await f.request('/push/test', subscription, c)).status, statusCode === 410 ? 410 : 502);
      assert.equal((await f.request('/push/status', subscription, c)).data.subscribed, statusCode !== 410);
    });
  }
});
test('an unconfigured server returns setup state and refuses subscription', async t => {
  const f = await serve(t, { env: {} }); const c = await f.login('admin');
  assert.equal((await f.request('/push/config', null, c)).data.configured, false);
  assert.equal((await f.request('/push/subscriptions', subscription, c)).status, 503);
});
