import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ru, type GmMember, type InviteCreated } from '@zg/shared';
import { RoleScreen } from '../components/Shell.tsx';
import { api } from '../lib/api.ts';
import { useWakeLock } from '../lib/wakeLock.ts';
import { errorText } from './errors.ts';

function memberStatus(m: GmMember): string {
  if (m.role === 'gm') return 'мастер';
  if (m.invitePending) return m.joined ? 'вошёл, выдана новая ссылка' : 'ждёт входа по ссылке';
  if (m.joined) return m.role === 'table' ? 'подключён' : 'вошёл, PIN задан';
  return 'ссылка истекла';
}

function InviteBox({ invite, name }: { invite: InviteCreated; name: string }) {
  const url = `${location.origin}${invite.path}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Зеленогорье', text: `Приглашение для ${name}`, url });
    } catch {}
  };
  return (
    <div className="invite">
      <p className="small muted">
        Ссылка для {name}, одноразовая, до {new Date(invite.expiresAt).toLocaleDateString('ru-RU')}:
      </p>
      <code className="invite-url">{url}</code>
      <div className="row">
        <button className="btn btn-secondary" onClick={copy}>
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
        {'share' in navigator && (
          <button className="btn btn-secondary" onClick={share}>
            Отправить
          </button>
        )}
      </div>
    </div>
  );
}

export function Gm() {
  useWakeLock();
  const [members, setMembers] = useState<GmMember[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'player' | 'table'>('player');
  const [invite, setInvite] = useState<{ data: InviteCreated; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await api<GmMember[]>('GET', '/api/gm/members');
    if (r.ok) setMembers(r.data);
    else setError(errorText(r.error));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = await api<InviteCreated>('POST', '/api/gm/members', { name, role });
    if (!r.ok) return setError(errorText(r.error));
    setInvite({ data: r.data, name });
    setName('');
    void reload();
  };

  const reissue = async (m: GmMember) => {
    setError(null);
    const r = await api<InviteCreated>('POST', `/api/gm/members/${m.id}/invite`);
    if (!r.ok) return setError(errorText(r.error));
    setInvite({ data: r.data, name: m.name });
    void reload();
  };

  return (
    <RoleScreen role="gm">
      <section className="card">
        <h2>Участники</h2>
        <ul className="list">
          {members.map((m) => (
            <li key={m.id} className="list-row">
              <div>
                <strong>{m.name}</strong>
                <div className="small muted">
                  {ru.roles[m.role]} · {memberStatus(m)}
                </div>
              </div>
              {m.role !== 'gm' && (
                <button className="btn btn-ghost" onClick={() => reissue(m)}>
                  Новая ссылка
                </button>
              )}
            </li>
          ))}
        </ul>
        {invite && <InviteBox invite={invite.data} name={invite.name} />}
      </section>

      <section className="card">
        <h2>Пригласить</h2>
        <form onSubmit={create} className="stack">
          <label className="field">
            <span>Имя</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </label>
          <label className="field">
            <span>Роль</span>
            <select value={role} onChange={(e) => setRole(e.target.value as 'player' | 'table')}>
              <option value="player">Игрок</option>
              <option value="table">Общий экран</option>
            </select>
          </label>
          <button className="btn" disabled={!name.trim()}>
            Создать ссылку
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>Инструменты</h2>
        <Link className="btn btn-secondary" to="/gm/jev">
          Песочница Jev
        </Link>
      </section>
    </RoleScreen>
  );
}
