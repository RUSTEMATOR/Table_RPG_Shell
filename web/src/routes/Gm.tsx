import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ru, type GmCharacterListItem, type GmMember, type InviteCreated } from '@zg/shared';
import { Feed } from '../components/Feed.tsx';
import { OpponentBox } from '../components/OpponentBox.tsx';
import { RollPanel } from '../components/RollPanel.tsx';
import { OverloadPanel } from '../components/OverloadPanel.tsx';
import { StatusPanel } from '../components/StatusPanel.tsx';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';
import { cn } from '../lib/cn.ts';
import { errorText } from './errors.ts';
import { Badge, Button, buttonVariants, Card, CardTitle, Field, Input, Segmented, Skeleton, toast } from '../ui/index.ts';

function memberStatus(m: GmMember): string {
  if (m.role === 'gm') return 'мастер';
  if (m.invitePending) return m.joined ? 'вошёл, выдана новая ссылка' : 'ждёт входа по ссылке';
  if (m.joined) return m.role === 'table' ? 'подключён' : 'вошёл, PIN задан';
  return 'ссылка истекла';
}

function InviteBox({ invite, name }: { invite: InviteCreated; name: string }) {
  const url = `${location.origin}${invite.path}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Ссылка скопирована');
    } catch {
      toast.error('Не скопировалось — выделите ссылку вручную');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Зеленогорье', text: `Приглашение для ${name}`, url });
    } catch {}
  };
  return (
    <div className="grid gap-2 rounded-control border border-solid border-accent bg-accent-soft p-3">
      <p className="m-0 text-[13.6px] text-muted">
        Ссылка для {name}, одноразовая, до {new Date(invite.expiresAt).toLocaleDateString('ru-RU')}:
      </p>
      <code className="font-mono text-[13px] break-all select-all">{url}</code>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={copy}>
          Копировать
        </Button>
        {'share' in navigator && (
          <Button size="sm" onClick={share}>
            Отправить
          </Button>
        )}
      </div>
    </div>
  );
}

/** «Игра»: противник сессии, бросок мастера, партия. Лента — в правой колонке; здесь — только пока колонка не помещается. */
/** «Позвать за стол» (этап 41): push всем игрокам. */
async function callPlayers(): Promise<void> {
  const r = await api<{ ok: true; enabled: boolean }>('POST', '/api/gm/session/call');
  if (!r.ok) toast.error(r.error === 'too_often' ? `Не чаще раза в минуту (ещё ${r.retryAfterSec ?? 60} с)` : 'Не получилось');
  else if (!r.data.enabled) toast('На сервере нет ключей VAPID: npm run vapid, затем перезапуск');
  else toast('Игроки позваны');
}

export function Gm() {
  return (
    <>
      <OpponentBox />
      <RollPanel role="gm" />
      <PartyStrip />
      <Card className="@5xl/gm:hidden">
        <CardTitle>Лента</CardTitle>
        <Feed gm limit={40} />
      </Card>
    </>
  );
}

export function GmParty() {
  return (
    <>
      <Characters />
      <OverloadPanel />
    </>
  );
}

function useCharacters(): GmCharacterListItem[] | null {
  const [list, setList] = useState<GmCharacterListItem[] | null>(null);
  const reload = useCallback(async () => {
    const r = await api<GmCharacterListItem[]>('GET', '/api/gm/characters');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useSocketEvent('gm:character.changed', () => void reload());
  return list;
}

const charMeta = (c: GmCharacterListItem) => (c.kind === 'local' ? 'местный' : `черт: ${c.slots}, раскрыто ${c.revealed}, намёков ${c.hinted}`);

/** Партия на «Игре»: персонажи с игроками, плитками — переход на страницу персонажа. */
function PartyStrip() {
  const list = useCharacters()?.filter((c) => c.ownerName);
  return (
    <Card>
      <div className="flex items-center gap-3">
        <CardTitle className="grow">Партия</CardTitle>
        <Link to="/gm/party" viewTransition className="font-ui text-sm font-semibold text-link">
          Все персонажи →
        </Link>
      </div>
      {list === undefined && <Skeleton className="h-16" />}
      {list?.length === 0 && <p className="m-0 text-muted">У игроков пока нет персонажей.</p>}
      <div className="grid gap-3 @lg/main:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
        {list?.map((c) => (
          <Link
            key={c.id}
            to={`/gm/char/${c.id}`}
            viewTransition
            className="grid gap-1 rounded-card border border-solid border-border px-3.5 py-3 text-text no-underline transition-colors hover:border-accent hover:bg-surface-2"
          >
            <strong className="font-name text-[1.3rem] leading-tight font-normal">{c.name}</strong>
            <span className="text-[13px] text-muted">
              {c.ownerName} · {charMeta(c)}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function Characters() {
  const list = useCharacters();
  return (
    <Card>
      <div className="flex items-center gap-3">
        <CardTitle className="grow">Персонажи</CardTitle>
        <Link viewTransition className={cn(buttonVariants({ variant: 'primary' }), 'no-underline')} to="/gm/new">
          Новый
        </Link>
      </div>
      {list === null && <Skeleton className="h-24" />}
      {list?.length === 0 && <p className="m-0 text-muted">Пока никого. Бросьте попаданца или создайте местного.</p>}
      <ul className="m-0 grid list-none gap-x-6 p-0 @3xl/main:grid-cols-2">
        {list?.map((c) => (
          <li key={c.id} className="border-b border-solid border-border">
            <Link viewTransition to={`/gm/char/${c.id}`} className="flex items-center gap-3 rounded-control px-2 py-3 text-text no-underline hover:bg-surface-2">
              <div className="min-w-0 grow">
                <strong className="font-name text-[1.2rem] font-normal">{c.name}</strong>
                <div className="text-[13.6px] text-muted">
                  {charMeta(c)} · {c.ownerName ?? 'без игрока'}
                </div>
              </div>
              <span aria-hidden="true" className="text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function GmMembers() {
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
    toast(`Ссылка для ${name} создана`);
    setName('');
    void reload();
  };

  const reissue = async (m: GmMember) => {
    setError(null);
    const r = await api<InviteCreated>('POST', `/api/gm/members/${m.id}/invite`);
    if (!r.ok) return setError(errorText(r.error));
    setInvite({ data: r.data, name: m.name });
    toast(`Новая ссылка для ${m.name}`);
    void reload();
  };

  return (
    <>
      <Card>
        <CardTitle>Участники</CardTitle>
        <ul className="m-0 grid list-none gap-x-6 p-0 @3xl/main:grid-cols-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-solid border-border py-3">
              <div className="min-w-0 grow">
                <strong>{m.name}</strong>
                <div className="flex flex-wrap items-center gap-2 text-[13.6px] text-muted">
                  <Badge>{ru.roles[m.role]}</Badge>
                  {memberStatus(m)}
                </div>
              </div>
              {m.role !== 'gm' && (
                <Button variant="ghost" size="sm" onClick={() => reissue(m)}>
                  Новая ссылка
                </Button>
              )}
            </li>
          ))}
        </ul>
        {invite && <InviteBox invite={invite.data} name={invite.name} />}
      </Card>

      <Card>
        <CardTitle>Пригласить</CardTitle>
        <form onSubmit={create} className="grid gap-3">
          <Field label="Имя" error={error}>
            {(id, d) => <Input id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />}
          </Field>
          <Segmented
            label="Роль"
            value={role}
            onChange={setRole}
            options={[
              { value: 'player', label: 'Игрок' },
              { value: 'table', label: 'Общий экран' },
            ]}
          />
          <Button type="submit" variant="primary" disabled={!name.trim()} className="justify-self-start">
            Создать ссылку
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Инструменты</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void callPlayers()}>Позвать за стол</Button>
          <Link viewTransition className={cn(buttonVariants(), 'no-underline')} to="/gm/jev">
            Песочница Jev
          </Link>
        </div>
        <span className="text-[12.5px] text-muted">«Позвать за стол» — push-уведомление «Игра начинается» всем игрокам, у кого они включены; не чаще раза в минуту.</span>
      </Card>
      <StatusPanel />
    </>
  );
}
