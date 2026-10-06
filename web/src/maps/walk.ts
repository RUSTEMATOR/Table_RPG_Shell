import { useEffect, useRef } from 'react';
import type { PartyMove } from '@zg/shared';

// Поход отряда по дороге (этап 28): точка идёт вдоль пути с постоянной скоростью за ms. Общая для пергамента и 3D.
// Анимация — только для нового похода (seq сменился, пока карта на экране); при открытии карты отряд просто стоит.

type P = [number, number];

/** Точка на ломаной по доле пути 0…1. */
export function pointAt(path: P[], t: number): { x: number; y: number; dx: number; dy: number } {
  if (path.length === 1) return { x: path[0]![0], y: path[0]![1], dx: 0, dy: 0 };
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
    segs.push(l);
    total += l;
  }
  let need = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    const l = segs[i]!;
    if (need <= l || i === segs.length - 1) {
      const k = l ? Math.min(1, need / l) : 1;
      const [x0, y0] = path[i]!;
      const [x1, y1] = path[i + 1]!;
      return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, dx: x1 - x0, dy: y1 - y0 };
    }
    need -= l;
  }
  const last = path[path.length - 1]!;
  return { x: last[0], y: last[1], dx: 0, dy: 0 };
}

/**
 * Следить за походами отряда: при новом походе вызывает onStep с точкой пути каждый кадр, onEnd — в конце.
 * instant — без анимации (стол «Анимация выкл.», «уменьшить движение»).
 */
export function usePartyWalk(
  party: { x: number; y: number; move?: PartyMove | null } | null,
  opts: { instant: boolean; onStep: (p: { x: number; y: number; dx: number; dy: number }) => void; onStart?: () => void; onEnd?: () => void },
) {
  const seen = useRef<number | null>(party?.move?.seq ?? null);
  const cb = useRef(opts);
  cb.current = opts;
  const seq = party?.move?.seq ?? null;
  useEffect(() => {
    const m = party?.move;
    if (seq === null || seq === seen.current) return;
    seen.current = seq;
    if (!m || m.path.length < 2 || m.ms <= 0 || cb.current.instant) return;
    cb.current.onStart?.();
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / m.ms);
      // мягкий разгон и остановка
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      cb.current.onStep(pointAt(m.path, e));
      if (t < 1) raf = requestAnimationFrame(tick);
      else cb.current.onEnd?.();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      cb.current.onEnd?.();
    };
  }, [seq]); // новый поход — новая анимация
}
