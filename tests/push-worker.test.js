import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker() {
  const handlers = {}; const notifications = []; const opened = [];
  const self = { location: { origin: 'https://kidit.example' }, addEventListener: (type, fn) => { handlers[type] = fn; },
    registration: { showNotification: async (...args) => { notifications.push(args); } },
    clients: { matchAll: async () => [], openWindow: async url => { opened.push(url); } } };
  vm.runInNewContext(source, { self, URL });
  const dispatch = async (type, event) => {
    let pending; handlers[type]({ ...event, waitUntil: value => { pending = value; } }); await pending;
  };
  return { dispatch, notifications, opened, handlers };
}
test('every push shows a visible notification, including malformed payloads', async () => {
  const w = worker();
  await w.dispatch('push', { data: { json: () => { throw new Error('bad payload'); } } });
  assert.equal(w.notifications[0][0], 'KidIT Manager');
  assert.ok(w.notifications[0][1].body);
  assert.equal(w.handlers.fetch, undefined);
});
test('notification destinations are restricted to this site', async () => {
  const w = worker();
  await w.dispatch('push', { data: { json: () => ({ url: 'https://evil.example' }) } });
  assert.equal(w.notifications[0][1].data.url, '/');
  await w.dispatch('push', { data: { json: () => ({ url: '/schedule?day=1' }) } });
  assert.equal(w.notifications[1][1].data.url, '/schedule?day=1');
  await w.dispatch('notificationclick', { notification: { close() {}, data: { url: '/schedule' } } });
  assert.equal(w.opened[0], 'https://kidit.example/schedule');
  await w.dispatch('notificationclick', { notification: { close() {}, data: { url: 'https://evil.example' } } });
  assert.equal(w.opened.length, 1);
});
