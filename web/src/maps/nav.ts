import { useCallback, useEffect, useRef, useState } from 'react';
import { MAP_H, MAP_W, type MapId } from '@zg/shared';
import type { MapCamera } from './camera.ts';

// Переход между картами (мир ⇄ регион) — общий для игрока и мастера, для пергамента и 3D. Вглубь: камера наезжает на
// регион, затемнение, своя карта региона открывается вблизи и отъезжает на всю карту. Обратно: карта региона гаснет,
// карта мира открывается наехав на тот регион, откуда вернулись, и отъезжает. Так видно, где ты и откуда пришёл.

type Shape = number[][][];
type LinkRegion = { shape: Shape; link: MapId | null; name: string };

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Середина региона (по рамке самого большого контура). */
export function centerOf(shape: Shape): { x: number; y: number } {
  const ring = [...shape].sort((a, b) => b.length - a.length)[0] ?? [];
  if (!ring.length) return { x: MAP_W / 2, y: MAP_H / 2 };
  const xs = ring.map((p) => p[0]!),
    ys = ring.map((p) => p[1]!);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** Точка внутри региона. */
export function inRegion(shape: Shape, x: number, y: number): boolean {
  let inside = false;
  for (const ring of shape)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i]![0]!,
        yi = ring[i]![1]!,
        xj = ring[j]![0]!,
        yj = ring[j]![1]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

/** home — масштаб «всей карты» после перехода (на телефоне — чтобы карта заполняла экран, без полос). */
export function useMapNav(mapId: MapId, setMapId: (m: MapId) => void, camera: MapCamera | null, regions: LinkRegion[], home: () => number = () => 1) {
  const [fading, setFading] = useState(false);
  const pending = useRef<{ from: MapId; to: MapId } | null>(null);
  const busy = useRef(false);

  const go = useCallback(
    async (to: MapId) => {
      if (to === mapId || busy.current) return;
      busy.current = true;
      const calm = reduced();
      const link = regions.find((r) => r.link === to);
      if (camera && !calm) {
        if (link) {
          const c = centerOf(link.shape);
          camera.flyTo(c.x, c.y, 2.6, { duration: 0.55 });
          await wait(430);
        } else {
          camera.flyTo(MAP_W / 2, MAP_H / 2, 1, { duration: 0.35 });
          await wait(200);
        }
      }
      setFading(true);
      await wait(calm ? 0 : 180);
      pending.current = { from: mapId, to };
      setMapId(to);
      busy.current = false;
      // страховка: карта не пришла — не держать экран тёмным
      window.setTimeout(() => setFading(false), 2500);
    },
    [mapId, setMapId, camera, regions],
  );

  /** Новая карта пришла: поставить камеру. true — переход обработан (не центрировать на отряде). */
  const arrived = useCallback(
    (map: { id: MapId; regions: LinkRegion[] }) => {
      const p = pending.current;
      if (!p || map.id !== p.to || !camera) return false;
      pending.current = null;
      const calm = reduced();
      const back = map.regions.find((r) => r.link === p.from);
      if (back) {
        const c = centerOf(back.shape);
        camera.flyTo(c.x, c.y, 2.6, { instant: true });
      } else camera.flyTo(MAP_W / 2, MAP_H / 2, 2, { instant: true });
      const z = home();
      if (!calm) window.setTimeout(() => camera.flyTo(MAP_W / 2, MAP_H / 2, z, { duration: 0.8 }), 60);
      else camera.flyTo(MAP_W / 2, MAP_H / 2, z, { instant: true });
      window.setTimeout(() => setFading(false), 40);
      return true;
    },
    [camera, home],
  );

  // смена карты снаружи (сохранённая карта, другая вкладка) — без затемнения
  useEffect(() => {
    if (!pending.current) setFading(false);
  }, [mapId]);

  return { go, arrived, fading };
}
