import { useCallback, useEffect, useState } from 'react';
import { DOWNTIME_KINDS, DOWNTIME_KIND_HINTS, DOWNTIME_KIND_LABELS, type DowntimeKind, type DowntimePlayer, type DowntimeStatePlayer } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { cn } from '../lib/cn.ts';
import { Button, Card, CardTitle, Field, Sheet, Textarea } from '../ui/index.ts';

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Дело между сессиями (этап 44): карточка сверху «Дневника». Игрок выбирает, чем персонаж занят до следующей игры,
 * и может менять выбор, пока мастер не разобрал дело. Итог мастера — здесь же. Без персонажа карточки нет.
 */
export function Downtime() {
  const [state, setState] = useState<DowntimeStatePlayer | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    const r = await api<DowntimeStatePlayer>('GET', '/api/player/downtime');
    if (r.ok) setState(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('downtime:changed', (s) => setState(s));
  if (!state) return null;
  const { current, previous } = state;
  // прошлое дело показываем, пока оно не разобрано или разобрано недавно и нового ещё нет
  const showPrev = previous && (!previous.resolvedAt || !current);
  return (
    <Card className="zg-downtime gap-2">
      <div className="flex items-center justify-between gap-3">
        <CardTitle>До следующей сессии</CardTitle>
        <Button size="sm" variant={current ? 'ghost' : 'primary'} disabled={!!current?.resolvedAt} onClick={() => setOpen(true)}>
          {current ? (current.resolvedAt ? 'Разобрано' : 'Изменить') : 'Выбрать дело'}
        </Button>
      </div>
      {current ? <Item d={current} /> : <p className="m-0 text-muted">Чем твой персонаж займётся до следующей игры? Мастер разберёт на сессии и расскажет, что вышло.</p>}
      {showPrev && (
        <div className="grid gap-1 border-t border-solid border-border pt-2">
          <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">Прошлая сессия</span>
          <Item d={previous} />
        </div>
      )}
      <DowntimeSheet open={open} onClose={() => setOpen(false)} cur={current} onSaved={(s) => setState(s)} />
    </Card>
  );
}

function Item({ d }: { d: DowntimePlayer }) {
  return (
    <div className="grid gap-1">
      <p className="m-0">
        <b>{DOWNTIME_KIND_LABELS[d.kind]}</b>
        {d.text ? ` — ${d.text}` : ''}
      </p>
      {d.resolvedAt && d.outcome ? (
        <p className="m-0 rounded-control border-l-[3px] border-solid border-accent bg-accent-soft px-3 py-2">
          <b>Итог ({when(d.resolvedAt)}):</b> {d.outcome}
        </p>
      ) : (
        <span className="text-[13px] text-muted">Мастер ещё не разобрал.</span>
      )}
    </div>
  );
}

function DowntimeSheet({ open, onClose, cur, onSaved }: { open: boolean; onClose: () => void; cur: DowntimePlayer | null; onSaved: (s: DowntimeStatePlayer) => void }) {
  const [kind, setKind] = useState<DowntimeKind>(cur?.kind ?? 'train');
  const [text, setText] = useState(cur?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setKind(cur?.kind ?? 'train');
      setText(cur?.text ?? '');
      setError(null);
    }
  }, [open, cur?.id]);
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await api<DowntimeStatePlayer>('POST', '/api/player/downtime', { kind, text });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'resolved' ? 'Мастер уже разобрал это дело.' : 'Не сохранилось, попробуй ещё раз.');
    onSaved(r.data);
    onClose();
  };
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="До следующей сессии" description="Чем займётся твой персонаж. Мастер это увидит.">
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-1.5 @md:grid-cols-3">
          {DOWNTIME_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                'cursor-pointer rounded-control border border-solid bg-transparent px-3 py-2 text-left font-ui text-[15px] transition-colors',
                kind === k ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2',
              )}
            >
              {DOWNTIME_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <p className="m-0 text-[13.6px] text-muted">{DOWNTIME_KIND_HINTS[kind]}</p>
        <Field label="Как именно (необязательно)" error={error}>
          {(id) => <Textarea id={id} rows={4} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Где, с кем, зачем…" />}
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" variant="primary" className="flex-[2]" disabled={busy} onClick={() => void save()}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
