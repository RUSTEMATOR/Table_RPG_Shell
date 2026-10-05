import { useCallback, useEffect, useState } from 'react';
import { SIGN_TEXT, type GmOverload } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';
import { Button, Card, CardTitle, Input, toast } from '../ui/index.ts';

/** Перегрузка зелёной магией: видит только мастер. Столу по кнопке уходит лишь видимый признак. */
export function OverloadPanel() {
  const [list, setList] = useState<GmOverload[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<GmOverload[]>('GET', '/api/gm/overload');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('gm:overload.changed', ({ overload }) =>
    setList((l) => (l.some((x) => x.characterId === overload.characterId) ? l.map((x) => (x.characterId === overload.characterId ? overload : x)) : [...l, overload])),
  );
  useSocketEvent('gm:character.changed', () => void load());

  const change = async (id: string, body: Record<string, unknown>) => {
    const r = await api<GmOverload>('POST', `/api/gm/overload/${encodeURIComponent(id)}`, body);
    if (r.ok) setList((l) => l.map((x) => (x.characterId === id ? r.data : x)));
  };
  const show = async (o: GmOverload) => {
    const r = await api('POST', `/api/gm/overload/${encodeURIComponent(o.characterId)}/show`);
    if (r.ok) {
      toast('Знаки перегрузки показаны на столе');
      setShown(o.characterId);
      window.setTimeout(() => setShown((s) => (s === o.characterId ? null : s)), 2500);
    }
  };

  return (
    <Card>
      <CardTitle>Перегрузка зелёной магией</CardTitle>
      {list.length === 0 && <p className="m-0 text-muted">Персонажей нет.</p>}
      <ul className="m-0 grid list-none gap-0 p-0">
        {list.map((o) => (
          <li key={o.characterId} className="grid gap-2 border-b border-solid border-border py-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="grow">{o.name}</strong>
              <span className={`sign sign-${o.sign}`}>{SIGN_TEXT[o.sign]}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-control border border-solid border-border bg-surface-2 p-0.5">
                <Button variant="ghost" size="icon" className="size-9" onClick={() => change(o.characterId, { delta: -1 })} disabled={o.value <= 0} aria-label="Минус один">
                  −
                </Button>
                <span className="min-w-10 text-center font-mono text-xl tabular-nums" aria-live="polite">
                  {o.value}
                </span>
                <Button variant="ghost" size="icon" className="size-9" onClick={() => change(o.characterId, { delta: 1 })} aria-label="Плюс один">
                  +
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => change(o.characterId, { reset: true })} disabled={o.value === 0}>
                Сброс
              </Button>
              <Button size="sm" onClick={() => show(o)}>
                {shown === o.characterId ? 'Показано' : 'Показать столу'}
              </Button>
            </div>
            <div className="flex flex-wrap gap-4 font-ui text-[13.6px] text-muted">
              <label className="inline-flex items-center gap-2">
                глаза с
                <Input
                  type="number"
                  min={1}
                  max={98}
                  value={o.eyesAt}
                  onChange={(e) => change(o.characterId, { eyesAt: Math.max(1, Number(e.target.value) || 1) })}
                  className="min-h-9 w-[4.5em] px-2 py-1"
                />
              </label>
              <label className="inline-flex items-center gap-2">
                кожа с
                <Input
                  type="number"
                  min={2}
                  max={99}
                  value={o.skinAt}
                  onChange={(e) => change(o.characterId, { skinAt: Math.max(2, Number(e.target.value) || 2) })}
                  className="min-h-9 w-[4.5em] px-2 py-1"
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
