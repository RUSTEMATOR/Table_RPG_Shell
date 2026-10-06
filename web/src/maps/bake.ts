import { createElement, useEffect, useRef, type ReactNode } from 'react';
import { MAP_H, MAP_W } from '@zg/shared';
import { capabilities } from '../lib/capabilities.ts';

// Запекание мягких слоёв пергамента в картинку. SVG-фильтры (шум бумаги, светотень, размытые заливки, туман) — самое
// дорогое на карте: браузер (особенно Safari на iPhone) пересчитывает их при каждой перерисовке и после каждого
// масштаба. Эти слои размыты сами по себе, поэтому их рисуем один раз в canvas нужного размера и дальше только
// двигаем картинку. Чёткое (реки, деревья, горы, дороги, подписи) остаётся живым SVG поверх.

/** Ширина картинки: на телефоне меньше (память), на компьютере — с запасом для приближения. */
export function bakeWidth(): number {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (mem < 4) return 1600;
  return capabilities.touch() ? 2000 : 2400;
}

/** Выключить запекание (?nobake=1) — сравнить с живыми фильтрами. */
export function bakeAllowed(): boolean {
  try {
    return new URLSearchParams(location.search).get('nobake') !== '1';
  } catch {
    return true;
  }
}

/** SVG-разметка → canvas заданной ширины. Фильтры считаются один раз, при рисовании. */
async function rasterize(xml: string, width: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = width;
    c.height = Math.round((width * MAP_H) / MAP_W);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('нет 2d-контекста');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Запечённый слой: children рисуются в скрытый SVG, по смене bakeKey он превращается в canvas. Новая картинка проявляется
 * поверх старой (fade мс), старая потом убирается. onResult — получилось ли (иначе карта рисуется живыми фильтрами).
 */
export function Baked({
  bakeKey,
  fade,
  className,
  onResult,
  children,
}: {
  bakeKey: string;
  fade: number;
  className?: string;
  onResult: (ok: boolean) => void;
  children: ReactNode;
}) {
  const src = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const result = useRef(onResult);
  result.current = onResult;
  useEffect(() => {
    const svg = src.current,
      host = box.current;
    if (!svg || !host) return;
    let cancelled = false;
    // источник скрыт (display:none) — в картинку уходит копия без этого стиля
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.removeAttribute('style');
    const xml = new XMLSerializer().serializeToString(clone);
    rasterize(xml, bakeWidth())
      .then((c) => {
        if (cancelled) return;
        const first = host.childElementCount === 0;
        c.style.cssText = `position:absolute;inset:0;width:100%;height:100%;opacity:${first || !fade ? 1 : 0};transition:opacity ${fade}ms ease-out`;
        host.appendChild(c);
        const old = [...host.children].filter((x) => x !== c);
        if (!first && fade) requestAnimationFrame(() => requestAnimationFrame(() => (c.style.opacity = '1')));
        window.setTimeout(() => old.forEach((o) => o.remove()), first || !fade ? 0 : fade + 100);
        result.current(true);
      })
      .catch(() => !cancelled && result.current(false));
    return () => {
      cancelled = true;
    };
  }, [bakeKey]); // children — по ключу
  return createElement(
    'div',
    { className },
    createElement('svg', { ref: src, xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${MAP_W} ${MAP_H}`, width: MAP_W, height: MAP_H, style: { display: 'none' } }, children),
    createElement('div', { ref: box, className: 'pointer-events-none absolute inset-0' }),
  );
}
