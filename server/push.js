import { createHash, createECDH } from 'node:crypto';
import * as webpush from 'web-push';
import { InputError } from './session-domain.js';

const hash = value => createHash('sha256').update(value).digest('hex');

export function validateSubscription(value) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048) throw new InputError('Đăng ký thông báo không hợp lệ.');
  let url;
  try { url = new URL(value.endpoint); } catch { throw new InputError('Địa chỉ Push không hợp lệ.'); }
  // Only contact browser push services, never an arbitrary user-supplied server.
  const allowed = url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com' ||
    url.hostname.endsWith('.push.apple.com') || url.hostname.endsWith('.notify.windows.com');
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !allowed) throw new InputError('Dịch vụ Push chưa được hỗ trợ.');
  const { p256dh, auth } = value.keys || {};
  const validKey = (key, length) => typeof key === 'string' && /^[A-Za-z0-9_-]+$/.test(key) && Buffer.from(key, 'base64url').length === length;
  if (!validKey(p256dh, 65) || Buffer.from(p256dh, 'base64url')[0] !== 4 || !validKey(auth, 16)) throw new InputError('Khóa đăng ký Push không hợp lệ.');
  return { endpoint: value.endpoint, keys: { p256dh, auth } };
}

export function pushConfig(env = process.env) {
  const publicKey = env.PUSH_VAPID_PUBLIC_KEY || '';
  const privateKey = env.PUSH_VAPID_PRIVATE_KEY || '';
  const subject = env.PUSH_VAPID_SUBJECT || '';
  try {
    const curve = createECDH('prime256v1');
    curve.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    if (curve.getPublicKey().toString('base64url') !== publicKey) return null;
    webpush.getVapidHeaders('https://web.push.apple.com', subject, publicKey, privateKey, 'aes128gcm');
    return { subject, publicKey, privateKey };
  } catch { return null; }
}

export function registerPush(app, pool, { env = process.env, send = (...args) => webpush.sendNotification(...args) } = {}) {
  const db = pool.promise();
  app.get('/api/push/config', async (_req, res, next) => {
    try {
      const config = pushConfig(env);
      const [[row]] = await db.query('SELECT id FROM push_scheduler WHERE id=1 AND last_run_at>DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 MINUTE)');
      res.json({ configured: !!config, publicKey: config?.publicKey || '', remindersRunning: !!row });
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ error: 'Chưa cài đặt thông báo trên máy chủ. Quản trị viên cần chạy migration Web Push.' });
      next(error);
    }
  });
  app.get('/api/push/preferences', async (req, res, next) => {
    try {
      const [[row]] = await db.query('SELECT lead_minutes FROM push_preferences WHERE account_id=?', [req.user.id]);
      res.json({ leadMinutes: row?.lead_minutes ?? 15, canRemind: req.user.role === 'admin' || !!req.user.teacher_id, allClasses: req.user.role === 'admin', dailySummaryHour: req.user.role === 'admin' ? 9 : null });
    } catch (error) { next(error); }
  });
  app.put('/api/push/preferences', async (req, res, next) => {
    try {
      const lead = req.body?.leadMinutes;
      if (![5, 15, 30].includes(lead)) throw new InputError('Chọn nhắc trước 5, 15 hoặc 30 phút.');
      if (req.user.role !== 'admin' && !req.user.teacher_id) throw new InputError('Tài khoản chưa liên kết giáo viên để nhận nhắc giờ.', 403);
      await db.query('INSERT INTO push_preferences (account_id,lead_minutes) VALUES (?,?) ON DUPLICATE KEY UPDATE lead_minutes=VALUES(lead_minutes)', [req.user.id, lead]);
      res.json({ leadMinutes: lead, canRemind: true, allClasses: req.user.role === 'admin', dailySummaryHour: req.user.role === 'admin' ? 9 : null });
    } catch (error) { next(error); }
  });
  const ready = () => {
    const config = pushConfig(env);
    if (!config) throw new InputError('Máy chủ chưa cấu hình Web Push. Vui lòng liên hệ quản trị viên.', 503);
    return config;
  };
  const endpointHash = req => {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 2048) throw new InputError('Thiếu đăng ký thông báo của thiết bị.');
    return hash(endpoint);
  };
  app.post('/api/push/status', async (req, res, next) => {
    try {
      const [[row]] = await db.query('SELECT endpoint_hash FROM push_subscriptions WHERE endpoint_hash=? AND account_id=? AND session_hash=?', [endpointHash(req), req.user.id, req.sessionHash]);
      res.json({ subscribed: !!row });
    } catch (error) { next(error); }
  });
  app.post('/api/push/subscriptions', async (req, res, next) => {
    try {
      ready();
      const subscription = validateSubscription(req.body);
      await db.query(`INSERT INTO push_subscriptions (endpoint_hash,account_id,session_hash,subscription) VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE account_id=VALUES(account_id),session_hash=VALUES(session_hash),subscription=VALUES(subscription),updated_at=CURRENT_TIMESTAMP`,
      [hash(subscription.endpoint), req.user.id, req.sessionHash, JSON.stringify(subscription)]);
      res.json({ subscribed: true });
    } catch (error) { next(error); }
  });
  app.delete('/api/push/subscriptions', async (req, res, next) => {
    try {
      await db.query('DELETE FROM push_subscriptions WHERE endpoint_hash=? AND account_id=? AND session_hash=?', [endpointHash(req), req.user.id, req.sessionHash]);
      res.json({ subscribed: false });
    } catch (error) { next(error); }
  });
  app.post('/api/push/test', async (req, res, next) => {
    try {
      const config = ready();
      const id = endpointHash(req);
      const [[row]] = await db.query(`SELECT p.subscription FROM push_subscriptions p JOIN account_sessions s ON s.token_hash=p.session_hash
        WHERE p.endpoint_hash=? AND p.account_id=? AND p.session_hash=? AND s.expires_at>CURRENT_TIMESTAMP`, [id, req.user.id, req.sessionHash]);
      if (!row) throw new InputError('Thiết bị chưa bật thông báo cho phiên đăng nhập này.', 404);
      const [result] = await db.query(`UPDATE push_subscriptions SET last_test_at=CURRENT_TIMESTAMP WHERE endpoint_hash=? AND account_id=? AND session_hash=?
        AND (last_test_at IS NULL OR last_test_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 SECOND))`, [id, req.user.id, req.sessionHash]);
      if (!result.affectedRows) throw new InputError('Vui lòng chờ 30 giây trước khi gửi thử lần nữa.', 429);
      try {
        await send(JSON.parse(row.subscription), JSON.stringify({ title: 'KidIT Manager', body: 'Thiết bị đã nhận được thông báo thử từ KidIT.', url: '/', tag: 'kidit-test' }), { vapidDetails: config, TTL: 60, timeout: 8000 });
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          await db.query('DELETE FROM push_subscriptions WHERE endpoint_hash=? AND account_id=? AND session_hash=?', [id, req.user.id, req.sessionHash]);
          throw new InputError('Đăng ký thông báo đã hết hạn. Hãy tắt rồi bật lại trên thiết bị.', 410);
        }
        throw new InputError('Dịch vụ Push chưa nhận được yêu cầu. Vui lòng thử lại sau.', 502);
      }
      res.json({ success: true });
    } catch (error) { next(error); }
  });
}
