import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { MapFocus, MapId, MapPublic } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { MapStage, can3d } from '../maps/MapStage.tsx';
import { CityScreen, usePlaceDetail } from '../maps/overlay/PlaceCard.tsx';
import type { MapCamera } from '../maps/camera.ts';

const TITLES: Record<MapId, string> = { world: 'Карта мира', razdolye: 'Раздолье', frozen: 'Замёрзшие земли' };

/**
 * Карта на столе: только открытое, туман над остальным. Мастер показал место — камера медленно наезжает на него;
 * открыл регион — туман над ним расходится. Без движения («Анимация выкл.») камера встаёт сразу.
 * 3D — если мастер показал карту из 3D и стол не в облегчённом режиме, иначе пергамент. «На стол: город» — экран города поверх (камера кружит над ним).
 */
export function TvMap({ show, still, lite }: { show: { id: MapId; focus: MapFocus | null } | null; still: boolean; lite: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <m.div key={show.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1 }}>
          <TvMapBody id={show.id} focus={show.focus} still={still} lite={lite} />
        </m.div>
      )}
    </AnimatePresence>
  );
}

function TvMapBody({ id, focus, still, lite }: { id: MapId; focus: MapFocus | null; still: boolean; lite: boolean }) {
  const [map, setMap] = useState<MapPublic | null>(null);
  const [camera, setCamera] = useState<MapCamera | null>(null);
  const reload = useCallback(async () => {
    const r = await api<MapPublic>('GET', `/api/table/maps/${id}`);
    if (r.ok) setMap(r.data);
  }, [id]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useSocketEvent('map:changed', (e) => e.mapId === id && void reload());
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void reload();
  }, [conn, reload]);

  // Наезд камеры: на точку мастера или на всю карту. Первый показ — сразу, дальше — плавно.
  const [first, setFirst] = useState(true);
  useEffect(() => {
    if (!camera || !map) return;
    const f = focus ?? { x: 800, y: 550, zoom: 1 };
    if (f.place && camera.orbit) camera.orbit(f.x, f.y, !still);
    else {
      camera.orbit?.(f.x, f.y, false);
      camera.flyTo(f.x, f.y, f.zoom, { duration: 2.6, instant: first || still });
    }
    setFirst(false);
  }, [camera, map, focus?.x, focus?.y, focus?.zoom, focus?.place, still]); // first меняется только здесь

  if (!map) return null;
  return (
    <>
      <MapStage
        look={focus?.look === '3d' && !lite && can3d() ? '3d' : '2d'}
        data={{ ...map, party: map.parties[0] ?? null }}
        mode="table"
        camera={setCamera}
        instant={still}
        follow={!still && !focus?.place}
        className="absolute inset-0 !cursor-default"
      />
      {/* тёмная виньетка: карта на тёмном экране, текст стола читается */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 shadow-[inset_0_0_18vh_rgba(13,15,13,.85)]" />
      {focus?.place ? (
        <TvCity id={focus.place} />
      ) : (
        <div className="pointer-events-none absolute bottom-[7vh] left-[5vw] grid gap-[1vh]">
          <span className="text-[clamp(14px,1.15vw,24px)] tracking-[.08em] text-[var(--tv-muted)] uppercase [text-shadow:0_1px_8px_rgba(0,0,0,.8)]">Карта</span>
          <h1 className="m-0 font-['Oranienbaum',Georgia,serif] text-[clamp(40px,4vw,84px)] leading-none font-normal [text-shadow:0_2px_24px_rgba(0,0,0,.8)]">{TITLES[id]}</h1>
        </div>
      )}
    </>
  );
}

/** «На стол: город» (этап 27): экран города крупно, поверх кружащей над ним камеры. Скрытое место — просто карта. */
function TvCity({ id }: { id: string }) {
  const { d } = usePlaceDetail('/api/table/maps/places', id);
  if (!d) return null;
  return (
    <m.div key={d.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.6 }}>
      <CityScreen d={d} table />
    </m.div>
  );
}
