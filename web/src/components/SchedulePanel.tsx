import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_GAME_MINUTES, VOTE_ANSWERS, VOTE_LABELS, type GmSchedule, type GmSlot } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { countdown } from './NextGame.tsx';
import { Badge, Button, buttonVariants, Card, CardTitle, Field, Input, toast } from '../ui/index.ts';
import { cn } from '../lib/cn.ts';

const fmt = (t: number) => new Date(t).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Расписание у мастера (этап 46): варианты для голосования, назначенная игра с явкой, напоминания, .ics. */
export function SchedulePanel() {
  const [s, setS] = useState<GmSchedule | null>(null);
  const [at, setAt] = useState(() => toLocalInput(Date.now() + 7 * 86_400_000));
  const [note, setNote] = useState('');
  const [hours, setHours] = useState(String(DEFAULT_GAME_MINUTES / 60));
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await api<GmSchedule>('GET', '/api/gm/schedule');
    if (r.ok) setS(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:schedule.changed', () => void load());

  const post = async (path: string, body: unknown, ok: string) => {
    setBusy(true);
    const r = await api<GmSchedule>('POST', path, body);
    setBusy(false);
    if (!r.ok) {
      toast.error('Не получилось');
      return;
    }
    setS(r.data);
    toast(ok);
  };
  const startsAt = new Date(at).getTime();
  const add = () => post('/api/gm/schedule/options', { startsAt, durationMin: Math.round(Number(hours) * 60) || DEFAULT_GAME_MINUTES, note }, 'Вариант добавлен');
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle className="grow">Расписание</CardTitle>
        {s?.planned && <Badge tone="ok">назначена · {countdown(s.planned.startsAt, s.planned.durationMin)}</Badge>}
      </div>
      {s?.planned && <SlotRow slot={s.planned} silent={s.silent} busy={busy} post={post} />}
      {s && s.options.length > 0 && (
        <div className="grid gap-2">
          <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">Голосование</span>
          {s.options.map((o) => (
            <SlotRow key={o.id} slot={o} busy={busy} post={post} />
          ))}
        </div>
      )}
      <div className="grid gap-2 rounded-control border border-dashed border-border p-3">
        <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">{s?.planned ? 'Предложить другие даты' : 'Варианты даты'}</span>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Дата и время">
            {(id) => <Input id={id} type="datetime-local" value={at} min={toLocalInput(Date.now())} onChange={(e) => setAt(e.target.value)} className="w-auto" />}
          </Field>
          <Field label="Часов">
            {(id) => <Input id={id} type="number" min={1} max={24} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} className="w-20" />}
          </Field>
          <Field label="Где, что взять (видят игроки)" className="min-w-[200px] grow">
            {(id) => <Input id={id} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Button disabled={busy || Number.isNaN(startsAt) || startsAt < Date.now()} onClick={() => void add()}>
            + Вариант
          </Button>
        </div>
        <p className="m-0 text-[13.6px] text-muted">
          Первый вариант шлёт игрокам «Когда играем?». «Назначить» — остальные варианты убираются, явка начинается заново, игрокам уходит «Игра назначена». Напоминания — за сутки и
          за час.
        </p>
      </div>
    </Card>
  );
}

function SlotRow({ slot, silent, busy, post }: { slot: GmSlot; silent?: string[]; busy: boolean; post: (path: string, body: unknown, ok: string) => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const planned = slot.kind === 'planned';
  const by = (a: (typeof VOTE_ANSWERS)[number]) => slot.answers.filter((x) => x.answer === a).map((x) => x.name);
  const url = `/api/gm/schedule/${encodeURIComponent(slot.id)}`;
  return (
    <div className="grid gap-1.5 rounded-control border border-solid border-border p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <b className={planned ? 'font-name text-[1.15rem]' : ''}>{fmt(slot.startsAt)}</b>
        <span className="text-xs text-muted">{slot.durationMin / 60} ч</span>
        {slot.note && <span className="text-[13px] text-muted">· {slot.note}</span>}
        <span className="grow" />
        {planned ? (
          <>
            <a className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }), 'no-underline')} href={`/api/schedule/${encodeURIComponent(slot.id)}/ics`} download>
              .ics
            </a>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void api('POST', `${url}/remind`).then((r) => (r.ok ? toast('Напоминание ушло') : toast.error('Не ушло')))}
            >
              Напомнить сейчас
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void post(`${url}/plan`, {}, 'Игра назначена, игрокам ушло уведомление')}>
            Назначить
          </Button>
        )}
        <Button
          size="sm"
          variant={confirm ? 'danger' : 'ghost'}
          disabled={busy}
          onBlur={() => setConfirm(false)}
          onClick={() => (confirm ? void post(`${url}/delete`, {}, planned ? 'Игра отменена' : 'Вариант убран') : setConfirm(true))}
        >
          {confirm ? 'Точно?' : planned ? 'Отменить' : 'Убрать'}
        </Button>
      </div>
      <span className="text-[13px] text-muted">
        {VOTE_ANSWERS.map((a) => `${VOTE_LABELS[a]}: ${by(a).length ? by(a).join(', ') : '—'}`).join(' · ')}
        {silent && silent.length > 0 ? ` · без ответа: ${silent.join(', ')}` : ''}
      </span>
    </div>
  );
}
