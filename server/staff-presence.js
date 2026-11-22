export const PRESENCE_TTL_MS = 35_000;

export function registerStaffPresence(app, pool, { now = Date.now } = {}) {
  const db = pool.promise();
  let nextCleanup = 0;

  app.post('/api/presence', async (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const time = now();
      await db.query(
        `INSERT INTO staff_presence (session_hash,active_until)
         SELECT token_hash,? FROM account_sessions WHERE token_hash=? AND expires_at>CURRENT_TIMESTAMP
         ON DUPLICATE KEY UPDATE active_until=GREATEST(active_until,VALUES(active_until))`,
        [time + PRESENCE_TTL_MS, req.sessionHash],
      );
      if (time >= nextCleanup) {
        await db.query('DELETE FROM staff_presence WHERE active_until<=?', [time]);
        nextCleanup = time + 60_000;
      }
      const [members] = await db.query(
        `SELECT DISTINCT a.id, COALESCE(t.name,'Quản trị viên') AS name
         FROM staff_presence p
         JOIN account_sessions s ON s.token_hash=p.session_hash
         JOIN accounts a ON a.id=s.account_id
         LEFT JOIN teachers t ON t.id=a.teacher_id
         WHERE p.active_until>? AND s.expires_at>CURRENT_TIMESTAMP
         ORDER BY name,a.id`,
        [time],
      );
      res.json(members);
    } catch (error) {
      next(error);
    }
  });
}
