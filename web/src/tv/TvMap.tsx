import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { MapFocus, MapId, MapPublic } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { MapView } from '../maps/MapView.tsx';
import type { Camera } from '../maps/camera.ts';

const TITLES: Record<MapId, string> = { world: 'Карта мира', razdolye: 'Раздолье', frozen: 'Замёрзшие земли' };

/**
 * Карта на столе: только открытое, туман над остальным. Мастер показал место — камера медленно наезжает на него;
 * открыл регион — туман над ним расходится. Без движения («Анимация выкл.») камера встаёт сразу.
 */
export function TvMap({ show, still }: { show: { id: MapId; focus: MapFocus | null } | null; still: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <m.div key={show.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1 }}>
          <TvMapBody id={show.id} focus={show.focus} still={still} />
        </m.div>
      )}
    </AnimatePresence>
  );
}

function TvMapBody({ id, focus, still }: { id: MapId; focus: MapFocus | null; still: boolean }) {
  const [map, setMap] = useState<MapPublic | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
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
    camera.flyTo(f.x, f.y, f.zoom, { duration: 2.6, instant: first || still });
    setFirst(false);
  }, [camera, map, focus?.x, focus?.y, focus?.zoom, still]); // first меняется только здесь

  if (!map) return null;
  return (
    <>
      <MapView data={map} mode="table" camera={setCamera} instant={still} className="absolute inset-0 !cursor-default" />
      {/* тёмная виньетка: карта на тёмном экране, текст стола читается */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 shadow-[inset_0_0_18vh_rgba(13,15,13,.85)]" />
      <div className="pointer-events-none absolute bottom-[7vh] left-[5vw] grid gap-[1vh]">
        <span className="text-[clamp(14px,1.15vw,24px)] tracking-[.08em] text-[var(--tv-muted)] uppercase [text-shadow:0_1px_8px_rgba(0,0,0,.8)]">Карта</span>
        <h1 className="m-0 font-['Oranienbaum',Georgia,serif] text-[clamp(40px,4vw,84px)] leading-none font-normal [text-shadow:0_2px_24px_rgba(0,0,0,.8)]">{TITLES[id]}</h1>
      </div>
    </>
  );
}
