import { useEffect, useMemo, useRef, useState } from 'react';
import { MAP_H, MAP_W, PLACE_KIND_LABELS, type PlaceKind } from '@zg/shared';
import type { MapCamera } from '../camera.ts';
import { cn } from '../../lib/cn.ts';
import { PerfOverlay, perfOn } from '../perf.ts';

// Навигация поверх карты — одна для пергамента и 3D: поиск места по названию (перелёт и выбор), масштаб, компас
// (3D: показывает, где север; нажать — повернуть на север), «К отряду», «Вся карта» и мини-карта с рамкой вида.

export type HudPlace = { id: string; name: string; kind: PlaceKind; x: number; y: number; subtitle: string; visible?: boolean };
export type HudRegion = { id: string; shape: number[][][]; fill: string | null; visible?: boolean };

const btn =
  'grid size-11 cursor-pointer place-items-center rounded-[10px] border border-solid border-[rgba(74,59,38,.22)] bg-[rgba(250,247,238,.94)] font-ui text-[20px] text-[#2e2416] shadow-[0_6px_18px_rgba(60,50,30,.16)] hover:bg-[#fffdf6]';
const stop = { onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(), onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() };

export function MapHud({
  camera,
  places,
  regions,
  party,
  onPlace,
  minimap = true,
  full = false,
  className,
}: {
  camera: MapCamera | null;
  places: HudPlace[];
  regions: HudRegion[];
  party: { x: number; y: number } | null;
  /** выбор места из поиска (карточка); перелёт камеры — здесь */
  onPlace?: (id: string) => void;
  minimap?: boolean;
  /** телефон, карта на весь экран: одна колонка справа (поиск сверху), без «+»/«−» (масштаб — пальцами), с учётом выреза */
  full?: boolean;
  className?: string;
}) {
  return (
    <>
      {!full && <Search camera={camera} places={places} {...(onPlace ? { onPlace } : {})} />}
      <div
        className={cn(
          'absolute flex flex-col gap-2',
          full ? 'top-[max(10px,env(safe-area-inset-top))] right-[max(10px,env(safe-area-inset-right))] z-[2]' : 'top-4 right-4',
          className,
        )}
        {...stop}
      >
        {full && <Search camera={camera} places={places} inColumn {...(onPlace ? { onPlace } : {})} />}
        {!full && (
          <>
            <button type="button" aria-label="Приблизить" title="Приблизить (+)" className={btn} onClick={() => camera?.zoomBy(1.5)}>
              +
            </button>
            <button type="button" aria-label="Отдалить" title="Отдалить (−)" className={btn} onClick={() => camera?.zoomBy(1 / 1.5)}>
              −
            </button>
          </>
        )}
        {camera?.north && <Compass camera={camera} />}
        {party && (
          <button type="button" aria-label="К отряду" title="К отряду (пробел)" className={btn} onClick={() => camera?.flyTo(party.x, party.y, 3.2, { duration: 0.9 })}>
            <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
              <path d="M6 22 V3" stroke="#3a2c1c" strokeWidth={2} strokeLinecap="round" />
              <path d="M7 4 H20 L17 8.5 L20 13 H7Z" fill="#1f7a4d" />
            </svg>
          </button>
        )}
        <button type="button" aria-label="Вся карта" title="Вся карта (Home)" className={btn} onClick={() => camera?.flyTo(MAP_W / 2, MAP_H / 2, 1, { duration: 0.9 })}>
          <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" fill="none" stroke="#2e2416" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      </div>
      {minimap && <MiniMap camera={camera} places={places} regions={regions} party={party} full={full} />}
      {perfOn() && <PerfOverlay />}
    </>
  );
}

function Compass({ camera }: { camera: MapCamera }) {
  const needle = useRef<SVGGElement>(null);
  useEffect(() => {
    const upd = () => needle.current?.setAttribute('transform', `rotate(${(((camera.yaw?.() ?? 0) * 180) / Math.PI).toFixed(1)})`);
    upd();
    return camera.onChange(upd);
  }, [camera]);
  return (
    <button type="button" aria-label="Повернуть на север" title="На север (N)" className={btn} onClick={() => camera.north?.()}>
      <svg viewBox="-12 -12 24 24" width={26} height={26} aria-hidden="true">
        <circle r={11} fill="none" stroke="rgba(46,36,22,.25)" />
        <g ref={needle}>
          <path d="M0 -10 L3.6 0 H-3.6Z" fill="#9a3b2f" />
          <path d="M0 10 L3.6 0 H-3.6Z" fill="#6b5d48" />
          <text y={-5.5} textAnchor="middle" fontSize={5.5} fontWeight={700} fill="#f3ecd9" style={{ fontFamily: 'system-ui, sans-serif' }}>
            С
          </text>
        </g>
      </svg>
    </button>
  );
}

function Search({ camera, places, onPlace, inColumn }: { camera: MapCamera | null; places: HudPlace[]; onPlace?: (id: string) => void; inColumn?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    const named = places.filter((p) => p.name);
    const list = s ? named.filter((p) => p.name.toLowerCase().includes(s) || p.subtitle.toLowerCase().includes(s)) : named;
    const rank = (k: PlaceKind) => (k === 'capital' ? 0 : k === 'bigtown' ? 1 : k === 'city' || k === 'town' ? 2 : k === 'village' ? 4 : 3);
    return list.sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name, 'ru')).slice(0, 8);
  }, [q, places]);
  useEffect(() => setActive(0), [q]);
  const go = (p: HudPlace) => {
    camera?.flyTo(p.x, p.y, 3.4, { duration: 1 });
    onPlace?.(p.id);
    setOpen(false);
    setQ('');
  };
  if (!places.some((p) => p.name)) return null;
  return (
    <div className={inColumn ? 'relative' : 'absolute top-4 left-4 z-[1] w-[min(300px,calc(100%-88px))]'} {...stop}>
      {open ? (
        <div
          className={cn(
            'overflow-hidden rounded-[12px] border border-solid border-[rgba(74,59,38,.22)] bg-[rgba(250,247,238,.97)] shadow-[0_10px_30px_rgba(40,30,15,.22)]',
            inColumn && 'absolute top-0 right-0 z-[3] w-[min(340px,calc(100vw-96px))]',
          )}
        >
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'ArrowDown') setActive((a) => Math.min(found.length - 1, a + 1));
              else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
              else if (e.key === 'Enter' && found[active]) go(found[active]);
              else return;
              e.preventDefault();
            }}
            placeholder="Найти место…"
            aria-label="Найти место на карте"
            className="block h-11 w-full border-0 bg-transparent px-3.5 font-ui text-[15px] text-[#2e2416] outline-none"
          />
          {found.length > 0 && (
            <ul role="listbox" className="m-0 max-h-[300px] list-none overflow-y-auto border-t border-solid border-[rgba(74,59,38,.14)] p-1">
              {found.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(p)}
                    onMouseEnter={() => setActive(i)}
                    className={cn('grid w-full cursor-pointer gap-0 rounded-[8px] border-0 px-2.5 py-1.5 text-left', i === active ? 'bg-[rgba(201,151,31,.16)]' : 'bg-transparent')}
                  >
                    <span className="font-['Cormorant_Garamond',Georgia,serif] text-[17px] leading-tight font-bold text-[#2e2416]">
                      {p.name}
                      {p.visible === false && <span className="font-ui text-[11px] font-normal text-[#8a7a5c]"> · скрыто</span>}
                    </span>
                    <span className="font-ui text-[12px] text-[#6b5d48]">
                      {PLACE_KIND_LABELS[p.kind]}
                      {p.subtitle ? ` · ${p.subtitle}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button
          type="button"
          className={cn(btn, !inColumn && 'w-auto gap-2 px-3 text-[15px]')}
          style={inColumn ? undefined : { display: 'flex' }}
          onClick={() => setOpen(true)}
          aria-label="Найти место"
        >
          <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" fill="none" stroke="#2e2416" strokeWidth={2} strokeLinecap="round">
            <circle cx={10.5} cy={10.5} r={6.5} />
            <path d="M15.5 15.5 L21 21" />
          </svg>
          {!inColumn && <span className="hidden sm:inline">Найти</span>}
        </button>
      )}
    </div>
  );
}

const MW = 176,
  MH = Math.round((MW * MAP_H) / MAP_W);

function MiniMap({
  camera,
  places,
  regions,
  party,
  full,
}: {
  camera: MapCamera | null;
  places: HudPlace[];
  regions: HudRegion[];
  party: { x: number; y: number } | null;
  full?: boolean;
}) {
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 900px)').matches);
  const base = useRef<HTMLCanvasElement | null>(null);
  const ref = useRef<HTMLCanvasElement>(null);

  // подложка: земли, места, отряд — перерисовывается только при новых данных
  useEffect(() => {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = MW * dpr;
    c.height = MH * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale((MW * dpr) / MAP_W, (MH * dpr) / MAP_H);
    ctx.fillStyle = '#d8d0bc';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    for (const r of regions) {
      const p = new Path2D(r.shape.map((ring) => 'M' + ring.map((q) => `${q[0]},${q[1]}`).join('L') + 'Z').join(''));
      ctx.globalAlpha = r.visible === false ? 0.45 : 1;
      ctx.fillStyle = r.fill ?? '#c9bf9f';
      ctx.fill(p);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#5b4630';
      ctx.lineWidth = 4;
      ctx.stroke(p);
    }
    ctx.globalAlpha = 1;
    for (const p of places) {
      if (p.kind !== 'capital' && p.kind !== 'bigtown' && p.kind !== 'city' && p.kind !== 'town') continue;
      ctx.fillStyle = p.kind === 'capital' || p.kind === 'bigtown' ? '#2b3d5c' : '#5b4630';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.kind === 'capital' || p.kind === 'bigtown' ? 14 : 9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (party) {
      ctx.fillStyle = '#1f7a4d';
      ctx.strokeStyle = '#f3ecd9';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(party.x, party.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    base.current = c;
  }, [places, regions, party?.x, party?.y]);

  // рамка вида — по движению камеры, не чаще кадра
  useEffect(() => {
    if (!camera || !open) return;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const c = ref.current;
      if (!c || !base.current) return;
      const dpr = base.current.width / MW;
      if (c.width !== base.current.width) {
        c.width = base.current.width;
        c.height = base.current.height;
      }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base.current, 0, 0);
      const v = camera.view();
      const k = (MW * dpr) / MAP_W;
      const w = (MAP_W / v.zoom) * k,
        h = (MAP_H / v.zoom) * k;
      ctx.translate(v.x * k, v.y * k);
      ctx.rotate(-(camera.yaw?.() ?? 0));
      ctx.strokeStyle = '#c9971f';
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    };
    const req = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    req();
    const off = camera.onChange(req);
    return () => {
      off();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [camera, open, places, regions, party?.x, party?.y]);

  return (
    <div className={full ? 'absolute right-[max(10px,env(safe-area-inset-right))] bottom-[max(10px,env(safe-area-inset-bottom))] z-[2]' : 'absolute right-4 bottom-4'} {...stop}>
      {open ? (
        <div className="relative overflow-hidden rounded-[10px] border-2 border-solid border-[rgba(250,247,238,.9)] shadow-[0_8px_24px_rgba(40,30,15,.3)]">
          <canvas
            ref={ref}
            style={{ width: MW, height: MH }}
            className="block cursor-pointer"
            aria-label="Мини-карта: нажмите, чтобы перейти"
            role="button"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - r.left) / r.width) * MAP_W,
                y = ((e.clientY - r.top) / r.height) * MAP_H;
              camera?.flyTo(x, y, Math.max(1.6, camera.view().zoom), { duration: 0.8 });
            }}
          />
          <button
            type="button"
            aria-label="Скрыть мини-карту"
            className="absolute top-1 right-1 grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-[rgba(32,26,18,.6)] text-[13px] text-[#f3ecd9]"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
      ) : (
        <button type="button" aria-label="Показать мини-карту" title="Мини-карта" className={btn} onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" fill="none" stroke="#2e2416" strokeWidth={1.8} strokeLinejoin="round">
            <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" />
          </svg>
        </button>
      )}
    </div>
  );
}
