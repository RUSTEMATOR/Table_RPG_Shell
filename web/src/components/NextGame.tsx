import { useCallback, useEffect, useState } from 'react';
import { VOTE_ANSWERS, VOTE_LABELS, type SchedulePlayer, type SlotPlayer, type VoteAnswer } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { cn } from '../lib/cn.ts';
import { Button, buttonVariants, Card, CardTitle } from '../ui/index.ts';

const fmt = (t: number) => new Date(t).toLocaleString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

/** «через 3 дня», «завтра в 19:00», «сегодня в 19:00», «через 40 минут», «идёт». */
export function countdown(startsAt: number, durationMin: number, now = Date.now()): string {
  const left = startsAt - now;
  if (left <= 0) return now < startsAt + durationMin * 60_000 ? 'идёт сейчас' : 'прошла';
  const time = new Date(startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const day = (t: number) => new Date(t).toDateString();
  if (day(startsAt) === day(now))
    return left < 3600_000 ? `через ${Math.max(1, Math.round(left / 60_000))} ${plural(Math.round(left / 60_000), 'минуту', 'минуты', 'минут')}` : `сегодня в ${time}`;
  if (day(startsAt) === day(now + 86_400_000)) return `завтра в ${time}`;
  const days = Math.round(left / 86_400_000);
  return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

/** Следующая игра (этап 46): сверху «Дневника». Назначенная дата с отсчётом и явкой или голосование за варианты. */
export function NextGame() {
  const [s, setS] = useState<SchedulePlayer | null>(null);
  const [, tick] = useState(0);
  const load = useCallback(async () => {
    const r = await api<SchedulePlayer>('GET', '/api/player/schedule');
    if (r.ok) setS(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('schedule:changed', (p) => setS(p));
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);
  if (!s || (!s.planned && s.options.length === 0)) return null;
  const answer = async (id: string, a: VoteAnswer) => {
    const r = await api<SchedulePlayer>('POST', `/api/player/schedule/${encodeURIComponent(id)}/vote`, { answer: a });
    if (r.ok) setS(r.data);
  };
  return (
    <Card className="zg-nextgame gap-2">
      <CardTitle>{s.planned ? 'Следующая игра' : 'Когда играем?'}</CardTitle>
      {s.planned ? (
        <Slot slot={s.planned} planned onAnswer={answer} />
      ) : (
        <>
          <p className="m-0 text-[13.6px] text-muted">Мастер предлагает даты — отметь, когда сможешь.</p>
          {s.options.map((o) => (
            <Slot key={o.id} slot={o} onAnswer={answer} />
          ))}
        </>
      )}
    </Card>
  );
}

function Slot({ slot, planned, onAnswer }: { slot: SlotPlayer; planned?: boolean; onAnswer: (id: string, a: VoteAnswer) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const by = (a: VoteAnswer) => slot.answers.filter((x) => x.answer === a).map((x) => x.name);
  return (
    <div className={cn('grid gap-1.5', !planned && 'border-t border-solid border-border pt-2 first:border-0 first:pt-0')}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <b className={planned ? 'font-name text-[1.25rem]' : ''}>{fmt(slot.startsAt)}</b>
        {planned && <span className="text-accent">{countdown(slot.startsAt, slot.durationMin)}</span>}
      </div>
      {slot.note && <span className="text-muted">{slot.note}</span>}
      <div className="flex flex-wrap gap-1.5">
        {VOTE_ANSWERS.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={slot.my === a ? 'primary' : 'ghost'}
            disabled={busy}
            aria-pressed={slot.my === a}
            onClick={async () => {
              setBusy(true);
              await onAnswer(slot.id, a);
              setBusy(false);
            }}
          >
            {VOTE_LABELS[a]}
            {by(a).length ? ` · ${by(a).length}` : ''}
          </Button>
        ))}
        {planned && (
          <a className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }), 'no-underline')} href={`/api/schedule/${encodeURIComponent(slot.id)}/ics`} download>
            В календарь
          </a>
        )}
      </div>
      {slot.answers.length > 0 && (
        <span className="text-[13px] text-muted">
          {VOTE_ANSWERS.filter((a) => by(a).length)
            .map((a) => `${VOTE_LABELS[a]}: ${by(a).join(', ')}`)
            .join(' · ')}
        </span>
      )}
    </div>
  );
}
