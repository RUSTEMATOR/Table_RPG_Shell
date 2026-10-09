import { useCallback, useEffect, useState } from 'react';
import type { BestiaryEntryPlayer, BestiaryPlayer } from '@zg/shared';
import units from '../maps3d/units.json';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { cn } from '../lib/cn.ts';
import { FigureSprite } from '../figure/FigureSprite.tsx';
import { Card, CardTitle, Sheet } from '../ui/index.ts';

const when = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

/** Бестиарий (этап 50): общая коллекция отряда — открытые чудища с фигуркой и описанием, закрытые — силуэтами. */
export function Bestiary() {
  const [b, setB] = useState<BestiaryPlayer | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<BestiaryPlayer>('GET', '/api/player/bestiary');
    if (r.ok) setB(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('bestiary:changed', (p) => setB(p));
  if (!b || b.total === 0) return null;
  const locked = Math.max(0, b.total - b.entries.length);
  const open = openId ? (b.entries.find((e) => e.id === openId) ?? null) : null;
  return (
    <Card className="zg-bestiary gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Бестиарий</CardTitle>
        <span className="text-[13.6px] text-muted">
          открыто {b.entries.length} из {b.total}
        </span>
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2 p-0">
        {b.entries.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => setOpenId(e.id)}
              className="grid w-full cursor-pointer justify-items-center gap-1 rounded-control border border-solid border-border bg-transparent p-2 text-inherit hover:bg-surface-2"
            >
              <Beast e={e} />
              <span className="w-full truncate text-center font-ui text-[13px]">{e.name}</span>
            </button>
          </li>
        ))}
        {Array.from({ length: locked }, (_, i) => (
          <li key={`locked-${i}`} aria-label="Ещё не встречено" className="grid justify-items-center gap-1 rounded-control border border-dashed border-border p-2 opacity-60">
            <span className="grid size-14 place-items-center rounded-full bg-surface-2 font-ui text-[22px] font-bold text-muted">?</span>
            <span className="font-ui text-[13px] text-muted">неизвестно</span>
          </li>
        ))}
      </ul>
      <Sheet
        open={open !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={open?.name ?? ''}
        description={open ? `встречен ${when(open.firstAt)} · ${open.fights} ${plural(open.fights, 'бой', 'боя', 'боёв')}` : undefined}
      >
        {open && (
          <div className="grid justify-items-center gap-3">
            <Beast e={open} big />
            {open.model3d && <span className="text-[13px] text-muted">На 3D-карте: {units.units[open.model3d]}</span>}
            <p className={cn('prewrap m-0 w-full font-read text-[1.05rem] leading-relaxed', !open.text && 'text-muted')}>{open.text || 'Мастер ещё не описал это чудище.'}</p>
          </div>
        )}
      </Sheet>
    </Card>
  );
}

function Beast({ e, big }: { e: BestiaryEntryPlayer; big?: boolean }) {
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2', big ? 'size-28' : 'size-14')}>
      {e.figure ? (
        <FigureSprite figure={e.figure} size={big ? 128 : 64} className="pointer-events-none" />
      ) : (
        <span className={cn('font-ui font-bold text-muted', big ? 'text-[40px]' : 'text-[22px]')}>{(e.name.trim()[0] ?? '?').toUpperCase()}</span>
      )}
    </span>
  );
}
