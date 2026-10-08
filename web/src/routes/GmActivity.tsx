import { useCallback, useEffect, useState } from 'react';
import type { GmPlayerPresence, GmPresenceLogEntry, PresenceStatus } from '@zg/shared';
import { api } from '../lib/api.ts';
import { STATUS_LABELS, elapsed, whereText } from '../lib/activityText.ts';
import { cn } from '../lib/cn.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { errorText } from './errors.ts';
import { Badge, Card, CardTitle, EmptyState, Skeleton } from '../ui/index.ts';

const time = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

const DOT: Record<PresenceStatus, string> = { online: 'bg-ok', hidden: 'bg-warn', offline: 'bg-muted opacity-50' };

function StatusDot({ status }: { status: PresenceStatus }) {
  return <span aria-hidden="true" className={cn('inline-block size-2.5 shrink-0 rounded-full', DOT[status])} />;
}

function devicesText(n: number): string {
  const tail = n % 10 === 1 && n % 100 !== 11 ? 'устройство' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'устройства' : 'устройств';
  return `${n} ${tail}`;
}

function logLine(e: GmPresenceLogEntry): string {
  if (e.status === 'offline') return 'вышел';
  const where = whereText(e.tab, e.action, e.placeName);
  if (e.status === 'hidden') return where ? `свернул (${where})` : 'свернул';
  return where ?? 'в сети';
}

function PlayerRow({ p, now }: { p: GmPlayerPresence; now: number }) {
  const where = p.status === 'offline' ? null : whereText(p.tab, p.action, p.placeName);
  const status =
    p.status === 'offline'
      ? p.lastSeenAt
        ? `${STATUS_LABELS.offline}, был ${elapsed(now - p.lastSeenAt)} назад`
        : `${STATUS_LABELS.offline}, ещё не входил`
      : STATUS_LABELS[p.status];
  return (
    <li className="grid gap-1.5 border-b border-solid border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot status={p.status} />
        <strong>{p.characterName ?? p.memberName}</strong>
        {p.characterName && <span className="text-[13.6px] text-muted">{p.memberName}</span>}
        {p.devices > 1 && <Badge>{devicesText(p.devices)}</Badge>}
      </div>
      <div className="text-[13.6px] text-muted">{status}</div>
      {where && (
        <div>
          {where}
          {p.since && <span className="text-[13.6px] text-muted"> · уже {elapsed(now - p.since)}</span>}
        </div>
      )}
      {p.log.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[13.6px] text-muted [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">
              ›
            </span>
            Журнал ({p.log.length})
          </summary>
          <ol className="m-0 mt-2 grid list-none gap-1 p-0 text-[13.6px]">
            {p.log.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-3">
                <span className="shrink-0 tabular-nums text-muted">{time(e.at)}</span>
                <span>{logLine(e)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}

/** Активность игроков: в сети ли, какая вкладка открыта, что делают. Журнал — с последнего перезапуска сервера. */
export function GmActivity() {
  const [players, setPlayers] = useState<GmPlayerPresence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const conn = useConnection();

  const reload = useCallback(async () => {
    const r = await api<{ players: GmPlayerPresence[] }>('GET', '/api/gm/presence');
    if (r.ok) {
      setPlayers(r.data.players);
      setError(null);
    } else setError(errorText(r.error));
  }, []);

  // после переподключения могло пройти что угодно — перечитать целиком
  useEffect(() => {
    if (conn === 'online') void reload();
  }, [conn, reload]);

  useSocketEvent('gm:presence.changed', (p) => {
    setNow(Date.now());
    setPlayers((list) => {
      if (!list) return list;
      return list.some((x) => x.memberId === p.memberId) ? list.map((x) => (x.memberId === p.memberId ? p : x)) : [...list, p];
    });
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <Card>
      <CardTitle>Активность</CardTitle>
      <p className="m-0 text-[13.6px] text-muted">Что открыто у игроков. Набранный текст и вид записи в дневнике сюда не попадают. Журнал — с последнего перезапуска сервера.</p>
      {error && <p className="error small">{error}</p>}
      {!players && !error && <Skeleton className="mt-3 h-24" />}
      {players?.length === 0 && <EmptyState icon="hooded-figure">Игроков пока нет. Пригласить — в «Участниках».</EmptyState>}
      {players && players.length > 0 && (
        <ul className="m-0 mt-2 grid list-none p-0">
          {players.map((p) => (
            <PlayerRow key={p.memberId} p={p} now={now} />
          ))}
        </ul>
      )}
    </Card>
  );
}
