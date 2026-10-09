import { useCallback, useEffect, useState } from 'react';
import { ATTITUDES, ATTITUDE_LABELS, type AcquaintancePlayer, type Attitude } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { cn } from '../lib/cn.ts';
import { FigureSprite } from '../figure/FigureSprite.tsx';
import { Button, Card, CardTitle, Field, Sheet, Textarea } from '../ui/index.ts';

const when = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const TONE: Record<Attitude, string> = { unknown: 'border-border text-muted', friend: 'border-ok text-ok', wary: 'border-warn text-warn', foe: 'border-danger text-danger' };

/** Знакомые (этап 49): встреченные жители мира — под карточкой персонажа. Отношение и заметка — свои; заметку мастер не видит. */
export function Acquaintances() {
  const [list, setList] = useState<AcquaintancePlayer[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<{ acquaintances: AcquaintancePlayer[] }>('GET', '/api/player/acquaintances');
    if (r.ok) setList(r.data.acquaintances);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('acquaintances:changed', ({ acquaintances }) => setList(acquaintances));
  if (!list || list.length === 0) return null;
  const open = openId ? (list.find((a) => a.id === openId) ?? null) : null;
  return (
    <Card className="zg-acquaintances gap-2">
      <CardTitle>Знакомые · {list.length}</CardTitle>
      <ul className="m-0 grid list-none gap-2 p-0">
        {list.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setOpenId(a.id)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-control border-0 bg-transparent p-1.5 text-left text-inherit hover:bg-surface-2"
            >
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2">
                {a.figure ? (
                  <FigureSprite figure={a.figure} size={56} className="pointer-events-none" />
                ) : (
                  <span className="font-ui text-[18px] font-bold">{(a.name.trim()[0] ?? '?').toUpperCase()}</span>
                )}
              </span>
              <span className="grid min-w-0 grow">
                <strong className="font-ui">{a.name}</strong>
                <span className="truncate text-[13px] text-muted">
                  {[a.label, a.place ? `встречен в ${a.place}, ${when(a.firstAt)}` : when(a.firstAt)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={cn('shrink-0 rounded-full border border-solid px-2 py-0.5 font-ui text-[12px]', TONE[a.attitude])}>{ATTITUDE_LABELS[a.attitude]}</span>
            </button>
          </li>
        ))}
      </ul>
      <AcqSheet a={open} onClose={() => setOpenId(null)} onSaved={setList} />
    </Card>
  );
}

function AcqSheet({ a, onClose, onSaved }: { a: AcquaintancePlayer | null; onClose: () => void; onSaved: (l: AcquaintancePlayer[]) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(a?.note ?? ''), [a?.id]);
  const save = async (patch: { attitude?: Attitude; note?: string }) => {
    if (!a) return;
    setBusy(true);
    const r = await api<{ acquaintances: AcquaintancePlayer[] }>('POST', `/api/player/acquaintances/${encodeURIComponent(a.id)}`, patch);
    setBusy(false);
    if (r.ok) onSaved(r.data.acquaintances);
  };
  return (
    <Sheet
      open={a !== null}
      onOpenChange={(o) => !o && onClose()}
      title={a?.name ?? ''}
      description={a ? [a.label, a.place ? `встречен в ${a.place}, ${when(a.firstAt)}` : ''].filter(Boolean).join(' · ') : undefined}
    >
      {a && (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-1.5">
            {ATTITUDES.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={a.attitude === k}
                disabled={busy}
                onClick={() => void save({ attitude: k })}
                className={cn(
                  'cursor-pointer rounded-control border border-solid bg-transparent px-3 py-2 font-ui text-[15px] transition-colors',
                  a.attitude === k ? `${TONE[k]} bg-surface-2` : 'border-border hover:bg-surface-2',
                )}
              >
                {ATTITUDE_LABELS[k]}
              </button>
            ))}
          </div>
          <Field label="Моя заметка" hint="Видишь только ты: мастер и ИИ её не читают.">
            {(id) => <Textarea id={id} rows={4} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Что знаю, чего остерегаться, что обещал…" />}
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
              Закрыть
            </Button>
            <Button type="button" variant="primary" className="flex-[2]" disabled={busy || note === a.note} onClick={() => void save({ note })}>
              {busy ? 'Сохраняю…' : 'Сохранить заметку'}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
