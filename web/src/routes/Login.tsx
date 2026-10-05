import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { PIN_LENGTH, ru, type LoginMembers, type MemberPublic } from '@zg/shared';
import { api } from '../lib/api.ts';
import { homeFor, useMe } from '../lib/me.tsx';
import { load, save } from '../lib/storage.ts';
import { errorText } from './errors.ts';

export function Login() {
  const { me, loading, refresh } = useMe();
  const navigate = useNavigate();
  const [code, setCode] = useState(() => load('zg:roomCode') ?? '');
  const [room, setRoom] = useState<LoginMembers | null>(null);
  const [member, setMember] = useState<MemberPublic | null>(null);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && me) navigate(homeFor(me.member.role), { replace: true });
  }, [loading, me, navigate]);

  const findRoom = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<LoginMembers>('GET', `/api/auth/room/${encodeURIComponent(code.trim().toUpperCase())}`);
    setBusy(false);
    if (!r.ok) return setError(errorText(r.error, r.retryAfterSec));
    save('zg:roomCode', code.trim().toUpperCase());
    setRoom(r.data);
  };

  const login = async (e: FormEvent) => {
    e.preventDefault();
    if (!member) return;
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true }>('POST', '/api/auth/login', {
      roomCode: code.trim().toUpperCase(),
      memberId: member.id,
      secret,
    });
    setBusy(false);
    setSecret('');
    if (!r.ok) return setError(errorText(r.error, r.retryAfterSec));
    const next = await refresh();
    if (next) navigate(homeFor(next.member.role), { replace: true });
  };

  return (
    <div className="screen center">
      <div className="card narrow">
        <h1>{ru.appName}</h1>
        {!room && (
          <form onSubmit={findRoom} className="stack">
            <label className="field">
              <span>Код комнаты</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="code-input"
                required
              />
            </label>
            <button className="btn" disabled={busy || code.trim().length !== 6}>
              Дальше
            </button>
          </form>
        )}
        {room && !member && (
          <div className="stack">
            <p className="muted">{room.roomName}. Кто вы?</p>
            {room.members.map((m) => (
              <button key={m.id} className="btn btn-secondary" onClick={() => setMember(m)}>
                {m.name}
                <span className="muted small"> · {ru.roles[m.role]}</span>
              </button>
            ))}
            <button className="btn btn-ghost" onClick={() => setRoom(null)}>
              Другой код
            </button>
          </div>
        )}
        {room && member && (
          <form onSubmit={login} className="stack">
            <p>
              Вход: <strong>{member.name}</strong>
            </p>
            <label className="field">
              <span>{member.role === 'gm' ? 'Пароль' : `PIN (${PIN_LENGTH} цифр)`}</span>
              {member.role === 'gm' ? (
                <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="current-password" required />
              ) : (
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={PIN_LENGTH}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value.replace(/\D/g, ''))}
                  autoComplete="current-password"
                  className="code-input"
                  required
                />
              )}
            </label>
            <button className="btn" disabled={busy || !secret}>
              Войти
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMember(null)}>
              Назад
            </button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
