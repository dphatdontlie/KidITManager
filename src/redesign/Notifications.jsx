import { useEffect, useState } from 'react';
import { PageHead, Button, Feedback } from './ui';
import { api, jsonBody } from '../lib/api';
import { pushSupport, pushState, requestPushPermission, enablePush, disablePush, testPush } from '../lib/push';
import './notifications.css';

export default function Notifications() {
  const [support] = useState(pushSupport);
  const [state, setState] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [lead, setLead] = useState(15);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(() => 'Notification' in window && Notification.permission === 'denied');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    setDenied('Notification' in window && Notification.permission === 'denied');
    if (support !== 'supported') { setLoading(false); return; }
    Promise.all([pushState(), api('/api/push/preferences')]).then(([next, preferences]) => {
      if (active) { setState(next); setPrefs(preferences); setLead(preferences.leadMinutes); }
    }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [support, reload]);
  const action = async fn => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const enable = () => {
    // Keep permission tied to the tap on iOS; do not put a network await before it.
    const permission = requestPushPermission();
    action(async () => {
      if (await permission !== 'granted') {
        setDenied(Notification.permission === 'denied');
        throw new Error('Bạn chưa cho phép thông báo. Chỉ bật khi bạn muốn nhận nhắc giờ.');
      }
      const subscription = await enablePush(state.config);
      setState(s => ({ ...s, subscription, subscribed: true }));
      setNotice('Đã bật thông báo cho thiết bị và phiên đăng nhập này.');
    });
  };
  const subscribed = state?.subscribed && !denied;
  return <div className="notifications-page">
    <PageHead title="Thông báo" description="Nhắc giờ dạy trên thiết bị của bạn, kể cả khi không mở KidIT." />
    <section className="notification-panel" aria-labelledby="device-notifications">
      <h2 id="device-notifications">Nhận trên thiết bị này</h2>
      {support === 'install' ? <div className="push-help"><p>Trên iPhone hoặc iPad, hãy thêm KidIT vào màn hình chính trước.</p><ol><li>Mở KidIT trong Safari, nhấn Chia sẻ.</li><li>Chọn Thêm vào Màn hình chính.</li><li>Mở icon KidIT vừa thêm, vào Thông báo và nhấn Bật thông báo.</li></ol><p>Cần iOS hoặc iPadOS 16.4 trở lên.</p></div>
        : support === 'https' ? <p>Thông báo cần kết nối HTTPS. Mở địa chỉ HTTPS của KidIT rồi thử lại.</p>
          : support === 'unsupported' ? <p>Trình duyệt này chưa hỗ trợ Web Push. Trên iPhone, dùng iOS 16.4 trở lên và mở KidIT từ màn hình chính.</p>
            : loading ? <p role="status">Đang kiểm tra cài đặt thông báo...</p> : <>
              <p className="push-status">{subscribed ? 'Đang bật cho phiên đăng nhập này.' : 'Chưa bật cho phiên đăng nhập này.'}</p>
              {denied && <p>Bạn đã chặn thông báo. Trên iPhone, vào Cài đặt → Thông báo → KidIT để cho phép, rồi mở lại trang này. Với trình duyệt khác, kiểm tra quyền thông báo của website.</p>}
              {state && !state.config.configured && <><p>Máy chủ chưa cấu hình thông báo. Vui lòng liên hệ quản trị viên để bật dịch vụ.</p><Button variant="secondary" disabled={busy || loading} onClick={() => setReload(n => n + 1)}>Kiểm tra cấu hình lại</Button></>}
              {state && <div className="push-actions">
                {!subscribed && <Button onClick={enable} disabled={busy || denied || !state.config.configured}>Bật thông báo</Button>}
                {subscribed && <Button disabled={busy || !state.config.configured} onClick={() => action(async () => {
                  await testPush(state.subscription); setNotice('Đã gửi tới dịch vụ Push. Kiểm tra thông báo trên thiết bị; chế độ Tập trung có thể ẩn cảnh báo.');
                })}>Gửi thông báo thử</Button>}
                {state.subscription && <Button variant="secondary" disabled={busy} onClick={() => action(async () => {
                  await disablePush(); setState(s => ({ ...s, subscription: null, subscribed: false })); setNotice('Đã tắt thông báo trên thiết bị này.');
                })}>Tắt trên thiết bị này</Button>}
              </div>}
              <p className="push-detail">Đăng xuất hoặc hết hạn phiên sẽ ngừng nhắc giờ. Sau khi đăng nhập lại, mở trang này và bật lại cho phiên mới.</p>
              <p className="push-detail">Thông báo nhắc giờ có thể hiển thị tên lớp, giờ bắt đầu và phòng trên màn hình khóa.</p>
            </>}
      <Feedback error={error} />
      {error && support === 'supported' && <Button variant="secondary" disabled={busy || loading} onClick={() => setReload(n => n + 1)}>Kiểm tra lại</Button>}
      <p className="push-feedback" role="status" aria-live="polite">{busy ? 'Đang xử lý...' : notice}</p>
    </section>
    {prefs && <section className="notification-panel" aria-labelledby="teaching-reminders"><h2 id="teaching-reminders">Nhắc trước giờ dạy</h2>
      {prefs.canRemind ? <><p>{prefs.allClasses ? 'Admin nhận nhắc giờ cho tất cả suất học của trung tâm, cùng bản tổng hợp lịch lúc 9:00 mỗi ngày (giờ Việt Nam).' : 'Nhắc các suất được phân công cho bạn theo lịch có hiệu lực của ngày dạy.'} Áp dụng thời gian nhắc cho mọi thiết bị của tài khoản.</p>
        <form className="push-preferences" onSubmit={e => { e.preventDefault(); action(async () => {
          const saved = await api('/api/push/preferences', jsonBody({ leadMinutes: lead }, 'PUT')); setPrefs(saved); setNotice('Đã lưu thời gian nhắc giờ.');
        }); }}><label htmlFor="push-lead">Thời gian nhắc<select id="push-lead" value={lead} disabled={busy} onChange={e => setLead(Number(e.target.value))}><option value={5}>Trước 5 phút</option><option value={15}>Trước 15 phút</option><option value={30}>Trước 30 phút</option></select></label><Button type="submit" disabled={busy || lead === prefs.leadMinutes}>Lưu thời gian nhắc</Button></form>
        {!state?.config.remindersRunning && <p className="push-detail">Bộ nhắc giờ chưa ghi nhận lượt chạy trong 3 phút gần đây. Quản trị viên cần kiểm tra lịch chạy ở máy chủ; gửi thử vẫn có thể dùng riêng.</p>}
        {!subscribed && <p className="push-detail">Bật thông báo ở phần trên để thiết bị này nhận nhắc giờ.</p>}
        <p className="push-detail">Thông báo phụ thuộc kết nối mạng và cài đặt iPhone. Lịch dạy trong KidIT là nơi kiểm tra giờ chính thức.</p>
      </> : <p>Tài khoản này chưa liên kết với giáo viên nên chưa có lịch dạy cá nhân để nhắc. Bạn vẫn có thể bật và gửi thử thông báo.</p>}
    </section>}
  </div>;
}
