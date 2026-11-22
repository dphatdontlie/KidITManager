import { useEffect, useState } from 'react';
import { AuthContext } from './auth';
import { api, jsonBody } from './api';
import { Button } from '../redesign/ui';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  useEffect(() => {
    const controller = new AbortController();
    api('/api/auth/me', { signal: controller.signal }).then(setUser).catch(e => { if (!controller.signal.aborted && e.status !== 401) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const expired = () => { setUser(null); setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); };
    window.addEventListener('kidit-auth-expired', expired);
    return () => { controller.abort(); window.removeEventListener('kidit-auth-expired', expired); };
  }, []);
  const login = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { setUser(await api('/api/auth/login', jsonBody(credentials))); setCredentials({ username: '', password: '' }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true); setError('');
    try { await api('/api/auth/logout', jsonBody({})); setUser(null); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const refreshUser = async () => {
    try { setUser(await api('/api/auth/me')); }
    catch (err) { if(err.status===401){setUser(null);setError('Thông tin đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');}else setError(err.message); }
  };
  if (loading) return <main className="auth-loading"><p role="status">Đang kiểm tra đăng nhập...</p></main>;
  if (!user) return <div className="login-shell"><section className="login-story"><div className="brand"><span className="brand-mark">KI</span><strong>KidIT</strong></div></section><main className="login-side"><form className="login-form" onSubmit={login}>
    <h1>Đăng nhập</h1>
    <label>Tên tài khoản<input required autoComplete="username" autoCapitalize="none" aria-label="Tên tài khoản" value={credentials.username} onChange={e => setCredentials(c => ({ ...c, username: e.target.value }))} /></label>
    <label>Mật khẩu<input required type="password" autoComplete="current-password" aria-label="Mật khẩu" value={credentials.password} onChange={e => setCredentials(c => ({ ...c, password: e.target.value }))} /></label>
    {error && <p role="alert" className="feedback-error">{error}</p>}
    <Button type="submit" disabled={busy}>{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}</Button>
    <p className="login-help">Quên tài khoản? Liên hệ quản trị viên của trung tâm.</p>
  </form></main></div>;
  return <AuthContext.Provider value={{ user, logout, busy, refreshUser }}>{error && <p role="alert" className="feedback-error">{error}</p>}{children}</AuthContext.Provider>;
}
