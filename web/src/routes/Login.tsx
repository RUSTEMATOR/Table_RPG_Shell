import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { PIN_LENGTH, ru, type LoginMembers, type MemberPublic } from '@zg/shared';
import { api } from '../lib/api.ts';
import { homeFor, useMe } from '../lib/me.tsx';
import { load, save } from '../lib/storage.ts';
import { errorText } from './errors.ts';
import { AuthFrame } from '../components/AuthFrame.tsx';
import { Button, Field, Input } from '../ui/index.ts';

export function Login() {
  const { me, loading, refresh } = useMe();
  const navigate = useNavigate();
  const [code, setCode] = useState(() => load('zg:roomCode') ?? '');
  const [room, setRoom] = useState<LoginMembers | null>(null);
  const [member, setMember] = useState<MemberPublic | null>(null);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);

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
    setDir(1);
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

  const step = !room ? 'code' : !member ? 'who' : 'secret';
  const go = (d: 1 | -1, f: () => void) => {
    setDir(d);
    setError(null);
    f();
  };
  const pin = 'text-center font-mono text-2xl tracking-[.35em] tabular-nums';

  return (
    <AuthFrame step={step} dir={dir}>
      {step === 'code' && (
        <form onSubmit={findRoom} className="grid gap-3">
          <Field label="Код комнаты" hint="Шесть знаков, его даёт мастер." error={error}>
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className={pin}
                required
                autoFocus
              />
            )}
          </Field>
          <Button type="submit" variant="primary" size="lg" disabled={busy || code.trim().length !== 6}>
            {busy ? 'Ищу…' : 'Дальше'}
          </Button>
        </form>
      )}
      {step === 'who' && room && (
        <>
          <p className="m-0 text-muted">{room.roomName}. Кто вы?</p>
          <div className="grid gap-2">
            {room.members.map((m) => (
              <Button key={m.id} size="lg" className="justify-start gap-3 text-left" onClick={() => go(1, () => setMember(m))}>
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft font-name text-base text-accent">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="grow">{m.name}</span>
                <span className="text-sm font-normal text-muted">{ru.roles[m.role]}</span>
              </Button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => go(-1, () => setRoom(null))}>
            Другой код
          </Button>
        </>
      )}
      {step === 'secret' && member && (
        <form onSubmit={login} className="grid gap-3">
          <p className="m-0">
            Вход: <strong>{member.name}</strong>
          </p>
          <Field label={member.role === 'gm' ? 'Пароль' : `PIN (${PIN_LENGTH} цифр)`} error={error}>
            {(id, describedBy) =>
              member.role === 'gm' ? (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  autoComplete="current-password"
                  required
                  autoFocus
                />
              ) : (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={PIN_LENGTH}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value.replace(/\D/g, ''))}
                  autoComplete="current-password"
                  className={pin}
                  required
                  autoFocus
                />
              )
            }
          </Field>
          <Button type="submit" variant="primary" size="lg" disabled={busy || !secret}>
            {busy ? 'Вхожу…' : 'Войти'}
          </Button>
          <Button variant="ghost" onClick={() => go(-1, () => setMember(null))}>
            Назад
          </Button>
        </form>
      )}
      {step === 'who' && error && <p className="error m-0">{error}</p>}
    </AuthFrame>
  );
}
