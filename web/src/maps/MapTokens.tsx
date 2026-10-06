import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { m } from 'motion/react';
import type { MapTokenPublic } from '@zg/shared';
import { FigureSprite, type Dir, type Pose } from '../figure/FigureSprite.tsx';
import { cn } from '../lib/cn.ts';

// Фигурки на карте (этап 24): миниатюры на подставке, как в настольной игре. HTML-слой поверх SVG в том же слое камеры
// (canvas внутри foreignObject в Safari с трансформациями рисуется неверно). Координата фигурки — точка под ногами.
// При перемещении фигурка идёт к новой точке, повернувшись в сторону движения.

export type ViewToken = Omit<MapTokenPublic, 'mine'> & { mine?: boolean; visible?: boolean };

/** Сторона клетки кадра в единицах карты (кадр LPC 64×64, ноги — у нижнего края). */
const S = 84;
const FEET = 0.94;
const SPEED = 260; // единиц карты в секунду

const dirOf = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');

export function MapTokens({
  tokens,
  editable,
  selected,
  instant,
  toMap,
  onToken,
  onTokenMove,
}: {
  tokens: ViewToken[];
  /** мастер: фигурки можно перетаскивать, скрытые видны бледно */
  editable: boolean;
  selected?: string | null;
  /** без ходьбы — сразу на место */
  instant?: boolean;
  toMap: (clientX: number, clientY: number) => { x: number; y: number };
  onToken?: (id: string) => void;
  onTokenMove?: (id: string, x: number, y: number) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {tokens.map((t) => (
        <Token
          key={t.id}
          t={t}
          editable={editable}
          selected={selected === t.id}
          instant={!!instant}
          toMap={toMap}
          {...(onToken ? { onToken } : {})}
          {...(onTokenMove ? { onTokenMove } : {})}
        />
      ))}
    </div>
  );
}

function Token({
  t,
  editable,
  selected,
  instant,
  toMap,
  onToken,
  onTokenMove,
}: {
  t: ViewToken;
  editable: boolean;
  selected: boolean;
  instant: boolean;
  toMap: (clientX: number, clientY: number) => { x: number; y: number };
  onToken?: (id: string) => void;
  onTokenMove?: (id: string, x: number, y: number) => void;
}) {
  const [pose, setPose] = useState<Pose>('idle');
  const [dir, setDir] = useState<Dir>('down');
  const [duration, setDuration] = useState(0);
  // Пока мастер тащит фигурку (и пока сервер не подтвердил новое место) — она стоит там, где её отпустили.
  const [held, setHeld] = useState<{ x: number; y: number } | null>(null);
  const prev = useRef({ x: t.x, y: t.y });

  useEffect(() => {
    const dx = t.x - prev.current.x;
    const dy = t.y - prev.current.y;
    const from = held ?? prev.current;
    prev.current = { x: t.x, y: t.y };
    if (!dx && !dy) return;
    setHeld(null);
    const dist = Math.hypot(t.x - from.x, t.y - from.y);
    if (instant || dist < 4) {
      setDuration(0);
      return;
    }
    const d = Math.min(2.6, Math.max(0.4, dist / SPEED));
    setDuration(d);
    setDir(dirOf(dx, dy));
    setPose('walk');
    const timer = window.setTimeout(() => setPose('idle'), d * 1000);
    return () => window.clearTimeout(timer);
  }, [t.x, t.y]); // held — на момент прихода новых координат

  const drag = useRef<{ moved: boolean; sx: number; sy: number } | null>(null);
  const down = (e: RPointerEvent) => {
    if (!editable) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { moved: false, sx: e.clientX, sy: e.clientY };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    d.moved = true;
    setDuration(0);
    setHeld(toMap(e.clientX, e.clientY));
  };
  const up = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    e.stopPropagation();
    if (!d.moved) return onToken?.(t.id);
    const q = toMap(e.clientX, e.clientY);
    const x = Math.round(Math.min(1600, Math.max(0, q.x)) * 10) / 10;
    const y = Math.round(Math.min(1100, Math.max(0, q.y)) * 10) / 10;
    setHeld({ x, y });
    onTokenMove?.(t.id, x, y);
  };

  const at = held ?? { x: t.x, y: t.y };
  const hidden = t.visible === false;
  const ring = t.kind === 'npc' ? '#8a1c1c' : '#1f7a4d';
  return (
    <m.div
      initial={false}
      animate={{ x: at.x - S / 2, y: at.y - S * FEET }}
      transition={{ duration, ease: 'linear' }}
      className={cn('absolute top-0 left-0', (editable || onToken) && 'pointer-events-auto', editable && 'cursor-grab active:cursor-grabbing')}
      style={{ width: S, height: S, opacity: hidden ? 0.5 : 1, zIndex: Math.round(at.y) }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onClick={(e) => e.stopPropagation()}
      role={onToken ? 'button' : 'img'}
      aria-label={`${t.name || 'Фигурка'}${hidden ? ' (скрыта)' : ''}`}
    >
      {/* подставка */}
      <span
        aria-hidden="true"
        className={cn('absolute left-1/2 -translate-x-1/2 rounded-[50%] border-solid', hidden && 'border-dashed')}
        style={{
          bottom: S * (1 - FEET) - 7,
          width: S * 0.56,
          height: 15,
          background: `color-mix(in srgb, ${ring} 30%, transparent)`,
          borderWidth: t.mine ? 3 : 2,
          borderColor: t.mine ? '#c9971f' : ring,
          boxShadow: '0 3px 6px rgba(40,30,15,.35)',
        }}
      />
      {selected && (
        <span
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 rounded-[50%] border-[2.5px] border-dashed border-[#c9971f]"
          style={{ bottom: S * (1 - FEET) - 13, width: S * 0.78, height: 27 }}
        />
      )}
      {t.figure ? (
        <FigureSprite figure={t.figure} pose={pose} dir={dir} size={S} className="pointer-events-none absolute inset-0" />
      ) : (
        <span
          aria-hidden="true"
          className="absolute left-1/2 grid -translate-x-1/2 place-items-center rounded-full border-[3px] border-solid border-[#f3ecd9] font-ui text-[26px] font-bold text-[#f3ecd9]"
          style={{ bottom: S * (1 - FEET), width: 44, height: 44, background: ring, boxShadow: '0 3px 8px rgba(40,30,15,.4)' }}
        >
          {(t.name.trim()[0] ?? '?').toUpperCase()}
        </span>
      )}
      {t.name && (
        <span
          className="absolute left-1/2 -translate-x-1/2 rounded-full px-2 font-ui text-[15px] leading-[22px] font-semibold whitespace-nowrap text-[#f3ecd9]"
          style={{ top: S * FEET + 9, background: t.mine ? '#7a5a12' : ring, boxShadow: '0 2px 5px rgba(40,30,15,.3)' }}
        >
          {t.name}
        </span>
      )}
    </m.div>
  );
}
