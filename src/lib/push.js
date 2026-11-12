import { api, jsonBody } from './api';

export function pushSupport() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!window.isSecureContext) return 'https';
  if (ios && !standalone) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'supported';
}

export async function pushRegistration() {
  await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  // Do not leave the screen busy forever if the worker fails to activate.
  let timer;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Chưa khởi động được thông báo. Hãy tải lại trang rồi thử lại.')), 12000); }),
    ]);
  } finally { clearTimeout(timer); }
}

function applicationKey(key) {
  const padded = key.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - key.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

export async function pushState() {
  const config = await api('/api/push/config');
  const registration = await pushRegistration();
  const subscription = await registration.pushManager.getSubscription();
  const status = subscription ? await api('/api/push/status', jsonBody({ endpoint: subscription.endpoint })) : { subscribed: false };
  return { config, subscription, subscribed: status.subscribed };
}

// Call immediately from a button handler, before awaiting any network request.
export function requestPushPermission() {
  return Notification.requestPermission();
}

export async function enablePush(config) {
  const registration = await pushRegistration();
  let subscription = await registration.pushManager.getSubscription();
  const key = applicationKey(config.publicKey);
  const previous = subscription?.options?.applicationServerKey;
  if (subscription && previous && (previous.byteLength !== key.length || !new Uint8Array(previous).every((value, i) => key[i] === value))) {
    await api('/api/push/subscriptions', jsonBody({ endpoint: subscription.endpoint }, 'DELETE'));
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  // Keep the browser subscription on failure so a retry can save the same endpoint.
  await api('/api/push/subscriptions', jsonBody(subscription.toJSON()));
  return subscription;
}

export async function disablePush() {
  const registration = await pushRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    // Remove server delivery first; do not claim success if it cannot be stopped.
    await api('/api/push/subscriptions', jsonBody({ endpoint: subscription.endpoint }, 'DELETE'));
    const removed = await subscription.unsubscribe();
    if (!removed) throw new Error('Đã tắt gửi từ máy chủ nhưng thiết bị chưa hủy đăng ký. Hãy thử lại.');
  }
}

export async function testPush(subscription) {
  await api('/api/push/test', jsonBody({ endpoint: subscription.endpoint }));
}
