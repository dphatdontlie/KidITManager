import * as webpush from 'web-push';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const file = new URL('../.env', import.meta.url);
const current = await readFile(file, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
if (/^[\t ]*PUSH_VAPID_(PUBLIC|PRIVATE)_KEY[\t ]*=[\t ]*[^\s#]+/m.test(current)) {
  throw new Error('.env đã có khóa Push. Không tự thay khóa vì sẽ làm hỏng đăng ký hiện có.');
}
const keys = webpush.generateVAPIDKeys();
const cleaned = current.replace(/^[\t ]*PUSH_VAPID_(PUBLIC|PRIVATE)_KEY[\t ]*=.*$/gm, '');
const cron = /^[\t ]*CRON_SECRET[\t ]*=[\t ]*[^\s#]+/m.test(cleaned) ? '' : `CRON_SECRET=${randomBytes(32).toString('hex')}\n`;
await writeFile(file, `${cleaned.replace(/^[\t ]*CRON_SECRET[\t ]*=[\t ]*$/gm, '').trimEnd()}\n\nPUSH_VAPID_PUBLIC_KEY=${keys.publicKey}\nPUSH_VAPID_PRIVATE_KEY=${keys.privateKey}\n${cron}`);
console.log('Đã lưu khóa Web Push và khóa cron (nếu chưa có) vào .env. Thêm PUSH_VAPID_SUBJECT=mailto:email-quan-tri hoặc URL HTTPS của trung tâm, rồi cấu hình các biến trên hosting. Không chia sẻ khóa riêng.');
