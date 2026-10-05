import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ru, type GmCharacterListItem, type GmMember, type InviteCreated } from '@zg/shared';
import { Feed } from '../components/Feed.tsx';
import { OpponentBox } from '../components/OpponentBox.tsx';
import { RollPanel } from '../components/RollPanel.tsx';
import { RoleScreen } from '../components/Shell.tsx';
import { GmNav } from '../components/GmNav.tsx';
import { OverloadPanel } from '../components/OverloadPanel.tsx';
import { StatusPanel } from '../components/StatusPanel.tsx';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';
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
  return (
    <RoleScreen role="gm">
      <GmNav />
      <section className="card">
        <h2>Сессия</h2>
        <OpponentBox />
      </section>
      <RollPanel role="gm" />
      <section className="card">
        <h2>Лента</h2>
        <Feed gm limit={40} />
      </section>
    </RoleScreen>
  );
}

export function GmParty() {
  useWakeLock();
  return (
    <RoleScreen role="gm">
      <GmNav />
      <Characters />
      <OverloadPanel />
    </RoleScreen>
  );
}

export function GmMembers() {
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
      <GmNav />
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
        <Link viewTransition className="btn btn-secondary" to="/gm/jev">
          Песочница Jev
        </Link>
      </section>
      <StatusPanel />
    </RoleScreen>
  );
}

function Characters() {
  const [list, setList] = useState<GmCharacterListItem[] | null>(null);
  const reload = useCallback(async () => {
    const r = await api<GmCharacterListItem[]>('GET', '/api/gm/characters');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useSocketEvent('gm:character.changed', () => void reload());
  return (
    <section className="card">
      <div className="row spread">
        <h2>Персонажи</h2>
        <Link viewTransition className="btn" to="/gm/new">
          Новый
        </Link>
      </div>
      {list === null && <p className="muted">Загрузка…</p>}
      {list?.length === 0 && <p className="muted">Пока никого. Бросьте попаданца или создайте местного.</p>}
      <ul className="list">
        {list?.map((c) => (
          <li key={c.id}>
            <Link viewTransition to={`/gm/char/${c.id}`} className="list-row list-link">
              <div>
                <strong>{c.name}</strong>
                <div className="small muted">
                  {c.kind === 'local' ? 'местный' : `черт: ${c.slots}, раскрыто ${c.revealed}, намёков ${c.hinted}`} ·{' '}
                  {c.ownerName ?? 'без игрока'}
                </div>
              </div>
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
