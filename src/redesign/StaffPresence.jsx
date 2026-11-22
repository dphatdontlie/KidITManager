import { useEffect, useState } from 'react';
import { api, jsonBody } from '../lib/api';
import './staff-presence.css';

const REFRESH_MS = 10_000;

function initials(name) {
  const words = name.trim().normalize('NFC').split(/\s+/);
  const letters = words.length > 1 ? words.slice(-2).map(word => [...word][0]).join('') : [...words[0]].slice(0, 2).join('');
  return letters.toLocaleUpperCase('vi');
}

function PresenceAvatar({ member, isSelf }) {
  return <span className={`presence-avatar presence-tone-${member.id % 4}`} title={isSelf ? `${member.name} (bạn)` : member.name} aria-hidden="true">
    {initials(member.name)}
  </span>;
}

export default function StaffPresence({ accountId }) {
  const [members, setMembers] = useState([]);
  useEffect(() => {
    let request;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || request) return;
      const controller = new AbortController();
      request = controller;
      try {
        const online = await api('/api/presence', { ...jsonBody({}), signal: controller.signal });
        if (!controller.signal.aborted) setMembers(online);
      } catch {
        if (!controller.signal.aborted) setMembers([]);
      } finally {
        if (request === controller) request = undefined;
      }
    };
    const visibilityChanged = () => {
      if (document.visibilityState === 'visible') void refresh();
      else {
        request?.abort();
        request = undefined;
      }
    };
    void refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      request?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [accountId]);
  if (!members.length) return null;
  const ordered = [...members.filter(member => member.id === accountId), ...members.filter(member => member.id !== accountId)];

  return <details className="staff-presence" onKeyDown={event => {
    if (event.key !== 'Escape' || !event.currentTarget.open) return;
    event.currentTarget.open = false;
    event.currentTarget.querySelector('summary').focus();
  }}>
    <summary aria-label={`${members.length} nhân sự đang truy cập`}>
      <span className="presence-stack" aria-hidden="true">
        {ordered.slice(0, 3).map(member => <PresenceAvatar key={member.id} member={member} isSelf={member.id === accountId}/>)}
      </span>
      {members.length > 3 && <span className="presence-more presence-more-wide" aria-hidden="true">+{members.length - 3}</span>}
      {members.length > 1 && <span className="presence-more presence-more-narrow" aria-hidden="true">+{members.length - 1}</span>}
    </summary>
    <div className="presence-panel">
      <strong>Đang truy cập · {members.length}</strong>
      <ul>{ordered.map(member => <li key={member.id}>
        <PresenceAvatar member={member} isSelf={member.id === accountId}/>
        <span>{member.name}{member.id === accountId && <small> (bạn)</small>}</span>
      </li>)}</ul>
    </div>
  </details>;
}
