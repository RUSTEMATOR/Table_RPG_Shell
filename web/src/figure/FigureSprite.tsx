import { useEffect, useRef, useState } from 'react';
import type { Figure } from '@zg/shared';
import { attackOf, sheetOf, type Sheet } from './compose.ts';
import type { Anim } from './catalog.ts';
import { cn } from '../lib/cn.ts';

export type Dir = 'up' | 'left' | 'down' | 'right';
export type Pose = 'idle' | 'walk' | 'attack' | 'hurt';
const ROW: Record<Dir, number> = { up: 0, left: 1, down: 2, right: 3 };
const FPS: Partial<Record<Anim, number>> = { idle: 2, walk: 9, slash: 12, thrust: 12, spellcast: 10, shoot: 14, hurt: 10 };

/**
 * Фигурка на холсте: кадры анимации по времени, без размытия пикселей. pose «attack» — анимация оружия.
 * once — сыграть один раз и остановиться на последнем кадре (onDone). size — сторона в CSS-пикселях для кадра 64×64
 * (у крупного удара холст в 3 раза больше, фигурка остаётся того же размера).
 */
export function FigureSprite({
  figure,
  pose = 'idle',
  dir = 'down',
  size = 128,
  once = false,
  paused = false,
  onDone,
  className,
  label,
}: {
  figure: Figure;
  pose?: Pose;
  dir?: Dir;
  size?: number;
  once?: boolean;
  paused?: boolean;
  onDone?: () => void;
  className?: string;
  label?: string;
}) {
  const anim: Anim = pose === 'attack' ? attackOf(figure) : pose;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let alive = true;
    void sheetOf(figure, anim).then((s) => alive && setSheet(s));
    return () => {
      alive = false;
    };
  }, [figure, anim]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !sheet) return;
    const ctx = c.getContext('2d')!;
    const row = sheet.rows === 1 ? 0 : Math.min(ROW[dir], sheet.rows - 1);
    // у ходьбы кадр 0 — «стоит», цикл с 1
    const first = anim === 'walk' ? 1 : 0;
    const n = sheet.cols - first;
    const draw = (i: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet.canvas, (first + i) * sheet.cell, row * sheet.cell, sheet.cell, sheet.cell, 0, 0, c.width, c.height);
    };
    if (paused || n <= 1) {
      draw(0);
      return;
    }
    const fps = FPS[anim] ?? 10;
    const start = performance.now();
    let raf = 0;
    let last = -1;
    const tick = (now: number) => {
      const k = Math.floor(((now - start) / 1000) * fps);
      const i = once ? Math.min(k, n - 1) : k % n;
      if (i !== last) {
        draw(i);
        last = i;
      }
      if (once && k >= n - 1) {
        done.current?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sheet, dir, anim, once, paused]);

  const scale = sheet ? sheet.cell / 64 : 1;
  const px = Math.round(size * scale);
  return (
    <canvas
      ref={ref}
      width={sheet?.cell ?? 64}
      height={sheet?.cell ?? 64}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('[image-rendering:pixelated]', className)}
      style={{ width: px, height: px, margin: scale > 1 ? -((px - size) / 2) : undefined }}
    />
  );
}
