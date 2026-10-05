import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PIN_LENGTH, ru, type InviteInfo } from '@zg/shared';
import { api } from '../lib/api.ts';
import { homeFor, useMe } from '../lib/me.tsx';
import { errorText } from './errors.ts';

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

  return (
    <div className="screen center">
      <div className="card narrow">
        <h1>{ru.appName}</h1>
        {!info && !error && <p className="muted">Проверяю приглашение…</p>}
        {info && (
          <form onSubmit={accept} className="stack">
            <p>
              {info.roomName}: приглашение для <strong>{info.name}</strong> ({ru.roles[info.role]}).
            </p>
            {info.needsSecret && (
              <>
                <p className="muted small">
                  {isGm
                    ? 'Задайте пароль мастера.'
                    : `Придумайте PIN из ${PIN_LENGTH} цифр. С ним можно войти с любого устройства по коду комнаты.`}
                </p>
                <label className="field">
                  <span>{isGm ? 'Пароль' : 'PIN'}</span>
                  <input
                    type="password"
                    inputMode={isGm ? 'text' : 'numeric'}
                    maxLength={isGm ? 200 : PIN_LENGTH}
                    value={secret}
                    onChange={(e) => setSecret(isGm ? e.target.value : e.target.value.replace(/\D/g, ''))}
                    autoComplete="new-password"
                    className={isGm ? '' : 'code-input'}
                    required
                  />
                </label>
                <label className="field">
                  <span>Ещё раз</span>
                  <input
                    type="password"
                    inputMode={isGm ? 'text' : 'numeric'}
                    maxLength={isGm ? 200 : PIN_LENGTH}
                    value={secret2}
                    onChange={(e) => setSecret2(isGm ? e.target.value : e.target.value.replace(/\D/g, ''))}
                    autoComplete="new-password"
                    className={isGm ? '' : 'code-input'}
                    required
                  />
                </label>
              </>
            )}
            <button className="btn" disabled={busy || !valid}>
              Войти как {info.name}
            </button>
          </form>
        )}
        {error && (
          <div className="stack">
            <p className="error">{error}</p>
            <button className="btn btn-secondary" onClick={() => navigate('/login')}>
              Войти по коду и PIN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
