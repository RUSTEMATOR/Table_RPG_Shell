import { createElement, useEffect, useState } from 'react';
import { load, save } from '../lib/storage.ts';

// Счётчик кадров карты для ручной проверки на телефоне: адрес с ?perf=1 включает его на этом устройстве, ?perf=0 — выключает.
// Показывает кадры в секунду, худший кадр за 2 с, в 3D — вызовы отрисовки и треугольники, время сборки сцены.

const KEY = 'zg:perf';

export function perfOn(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('perf');
    if (q === '1' || q === '0') save(KEY, q);
  } catch {
    /* без адреса — по сохранённому */
  }
  return load(KEY) === '1';
}

/** Что сообщает сцена (3D) и сборка (обе карты). */
export const perfStats: { calls?: number; triangles?: number; build: Record<string, number> } = { build: {} };

/** Замерить шаг сборки: время в мс попадает в счётчик. */
export function timed<T>(name: string, fn: () => T): T {
  const t = performance.now();
  const r = fn();
  perfStats.build[name] = Math.round(performance.now() - t);
  return r;
}

export function PerfOverlay() {
  const [text, setText] = useState('…');
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let worst = 0;
    let last = performance.now();
    let since = last;
    const tick = (now: number) => {
      worst = Math.max(worst, now - last);
      last = now;
      frames++;
      if (now - since >= 2000) {
        const fps = Math.round((frames * 1000) / (now - since));
        const three = perfStats.calls !== undefined ? ` · ${perfStats.calls} выз. · ${Math.round((perfStats.triangles ?? 0) / 1000)}k тр.` : '';
        const build = Object.entries(perfStats.build)
          .map(([k, v]) => `${k} ${v}`)
          .join(' · ');
        setText(`${fps} к/с · худший ${Math.round(worst)} мс${three}${build ? ` · сборка: ${build} мс` : ''}`);
        frames = 0;
        worst = 0;
        since = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return createElement(
    'div',
    {
      className: 'pointer-events-none absolute bottom-2 left-2 z-[5] rounded-md bg-[rgba(0,0,0,.72)] px-2 py-1 font-mono text-[11px] leading-tight text-[#9fe8b0]',
      'aria-hidden': true,
    },
    text,
  );
}
