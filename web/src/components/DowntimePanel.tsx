import { useCallback, useEffect, useState } from 'react';
import { DOWNTIME_KIND_LABELS, type GmDowntime } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { cn } from '../lib/cn.ts';
import { Badge, Button, Card, CardTitle, Field, Input, Textarea, toast } from '../ui/index.ts';

const day = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Дела между сессиями у мастера (этап 44): на «Игре». Неразобранные — сверху, итог пишет мастер (черновик — Claude). */
export function DowntimePanel() {
  const [list, setList] = useState<GmDowntime[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const load = useCallback(async () => {
    const r = await api<GmDowntime[]>('GET', '/api/gm/downtime');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:downtime.changed', () => void load());
  useSocketEvent('gm:session.changed', () => void load());
  if (list === null || list.length === 0) return null;
  const open = list.filter((d) => !d.resolvedAt);
  const done = list.filter((d) => d.resolvedAt);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle className="grow">Дела между сессиями</CardTitle>
        {open.length > 0 && <Badge tone="warn">{open.length} не разобрано</Badge>}
        {done.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Скрыть разобранные' : `Разобранные (${done.length})`}
          </Button>
        )}
      </div>
      {open.length === 0 && <p className="m-0 text-muted">Все дела разобраны.</p>}
      <ul className="m-0 grid list-none gap-0 p-0">
        {open.map((d) => (
          <li key={d.id} className="border-b border-solid border-border py-3 last:border-0">
            <Item d={d} onDone={setList} />
          </li>
        ))}
        {showDone &&
          done.map((d) => (
            <li key={d.id} className="border-b border-solid border-border py-3 last:border-0 opacity-80">
              <Item d={d} onDone={setList} />
            </li>
          ))}
      </ul>
    </Card>
  );
}

function Item({ d, onDone }: { d: GmDowntime; onDone: (l: GmDowntime[]) => void }) {
  const [outcome, setOutcome] = useState(d.outcome ?? '');
  const [hint, setHint] = useState('');
  const [editing, setEditing] = useState(!d.resolvedAt);
  const [busy, setBusy] = useState<'save' | 'draft' | null>(null);
  useEffect(() => setOutcome(d.outcome ?? ''), [d.outcome]);
  const resolve = async () => {
    setBusy('save');
    const r = await api<GmDowntime[]>('POST', `/api/gm/downtime/${encodeURIComponent(d.id)}/resolve`, { outcome });
    setBusy(null);
    if (!r.ok) return toast.error('Не сохранилось');
    toast(d.resolvedAt ? 'Итог обновлён' : 'Дело разобрано, игроку ушёл итог');
    onDone(r.data);
    setEditing(false);
  };
  const draft = async () => {
    setBusy('draft');
    const r = await api<{ text: string }>('POST', `/api/gm/downtime/${encodeURIComponent(d.id)}/draft`, { hint });
    setBusy(null);
    if (!r.ok) return toast.error(r.message ?? 'Черновик не получился');
    setOutcome(r.data.text);
    toast('Черновик в поле — поправьте и разберите');
  };
  return (
    <div className={cn('grid gap-2', !d.resolvedAt && 'border-l-[3px] border-solid border-accent pl-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">
          {d.characterName}
          {d.memberName ? ` (${d.memberName})` : ''} · сессия {day(d.sessionStartedAt)}
          {d.current ? ' (текущая)' : ''}
        </span>
        <Badge tone={d.resolvedAt ? 'ok' : 'accent'}>{DOWNTIME_KIND_LABELS[d.kind]}</Badge>
        {d.resolvedAt && <span className="text-xs text-muted">разобрано {when(d.resolvedAt)}</span>}
      </div>
      {d.text && <p className="prewrap m-0 font-read">{d.text}</p>}
      {editing ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Подсказка Claude (необязательно)" className="grow">
              {(id) => <Input id={id} value={hint} maxLength={2000} onChange={(e) => setHint(e.target.value)} placeholder="Удалось, но с долгом; встретил старого знакомого…" />}
            </Field>
            <Button size="sm" disabled={busy !== null} onClick={() => void draft()}>
              {busy === 'draft' ? 'Пишу…' : 'Черновик Claude'}
            </Button>
          </div>
          <Field label="Итог для игрока">{(id) => <Textarea id={id} rows={3} value={outcome} maxLength={4000} onChange={(e) => setOutcome(e.target.value)} />}</Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" disabled={busy !== null || !outcome.trim()} onClick={() => void resolve()}>
              {busy === 'save' ? 'Сохраняю…' : d.resolvedAt ? 'Сохранить итог' : 'Разобрать'}
            </Button>
            {d.resolvedAt && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="m-0 rounded-control border-l-[3px] border-solid border-accent bg-accent-soft px-3 py-2">{d.outcome}</p>
          <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setEditing(true)}>
            Изменить итог
          </Button>
        </>
      )}
    </div>
  );
}
