import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PIN_LENGTH, ru, type InviteInfo } from '@zg/shared';
import { api } from '../lib/api.ts';
import { homeFor, useMe } from '../lib/me.tsx';
import { errorText } from './errors.ts';
import { AuthFrame } from '../components/AuthFrame.tsx';
import { Button, Field, Input, Skeleton } from '../ui/index.ts';

// GET приглашения ничего не меняет; ссылка гасится только по кнопке (POST).
export function Join() {
  const { token = '' } = useParams();
  const { refresh } = useMe();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [secret2, setSecret2] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<InviteInfo>('GET', `/api/auth/invite/${encodeURIComponent(token)}`).then((r) => {
      if (r.ok) setInfo(r.data);
      else setError(errorText(r.error, r.retryAfterSec));
    });
  }, [token]);

  const isGm = info?.role === 'gm';
  const valid = !info?.needsSecret || (secret === secret2 && (isGm ? secret.length >= 8 : secret.length === PIN_LENGTH));

  const accept = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true }>('POST', `/api/auth/invite/${encodeURIComponent(token)}`, info?.needsSecret ? { secret } : {});
    setBusy(false);
    if (!r.ok) return setError(errorText(r.error, r.retryAfterSec));
    const me = await refresh();
    if (me) navigate(homeFor(me.member.role), { replace: true });
  };

  const pin = isGm ? '' : 'text-center font-mono text-2xl tracking-[.35em] tabular-nums';
  const secretInput = (value: string, set: (v: string) => void, id: string, describedBy: string | undefined, first?: boolean) => (
    <Input
      id={id}
      aria-describedby={describedBy}
      type="password"
      inputMode={isGm ? 'text' : 'numeric'}
      maxLength={isGm ? 200 : PIN_LENGTH}
      value={value}
      onChange={(e) => set(isGm ? e.target.value : e.target.value.replace(/\D/g, ''))}
      autoComplete="new-password"
      className={pin}
      required
      autoFocus={first}
    />
  );
  const mismatch = secret2.length > 0 && secret2.length >= secret.length && secret !== secret2;

  return (
    <AuthFrame step={info ? 'invite' : error ? 'error' : 'loading'}>
      {!info && !error && (
        <div className="grid gap-2" aria-busy="true">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-11 w-full" />
          <p className="m-0 text-muted">Проверяю приглашение…</p>
        </div>
      )}
      {info && (
        <form onSubmit={accept} className="grid gap-3">
          <p className="m-0">
            {info.roomName}: приглашение для <strong>{info.name}</strong> ({ru.roles[info.role]}).
          </p>
          {info.needsSecret && (
            <>
              <p className="m-0 text-[13.6px] text-muted">
                {isGm ? 'Задайте пароль мастера, не короче 8 знаков.' : `Придумайте PIN из ${PIN_LENGTH} цифр. С ним можно войти с любого устройства по коду комнаты.`}
              </p>
              <Field label={isGm ? 'Пароль' : 'PIN'}>{(id, d) => secretInput(secret, setSecret, id, d, true)}</Field>
              <Field label="Ещё раз" error={mismatch ? 'Не совпадает с первым.' : undefined}>
                {(id, d) => secretInput(secret2, setSecret2, id, d)}
              </Field>
            </>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={busy || !valid}>
            {busy ? 'Вхожу…' : `Войти как ${info.name}`}
          </Button>
          {error && <p className="error m-0">{error}</p>}
        </form>
      )}
      {!info && error && (
        <>
          <p className="error m-0">{error}</p>
          <Button onClick={() => navigate('/login')}>Войти по коду и PIN</Button>
        </>
      )}
    </AuthFrame>
  );
}
