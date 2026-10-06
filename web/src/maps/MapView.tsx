import { lazy, Suspense, useEffect, useMemo, useRef, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { m } from 'motion/react';
import { PLACE_KIND_LABELS, type MapId, type MapNote, type MapPlacePublic, type MapRegionPublic, type PlaceKind } from '@zg/shared';
import { ArtBase, ArtDefs, ArtPaper, ArtRelief, ArtTop, PaperDefs, useArt } from './MapArt.tsx';
import { useCamera, type MapCamera } from './camera.ts';
import { ensureMapFonts } from './fonts.ts';
import { cn } from '../lib/cn.ts';
import type { ViewToken } from './MapTokens.tsx';

// Фигурки — отдельный чанк (каталог деталей LPC, сборка листов): грузится, только когда на карте есть фигурки.
const MapTokens = lazy(() => import('./MapTokens.tsx').then((m) => ({ default: m.MapTokens })));

// Карта: рельеф (MapArt), регионы, дороги, туман, места, маркер партии, фигурки, заметки. Одна и та же для мастера, игрока и стола:
// разница — в данных (игрок и стол получают только открытое) и в режиме (мастер видит скрытое заштрихованным, без тумана).

export type ViewRegion = MapRegionPublic & { visible?: boolean };
export type ViewPlace = MapPlacePublic & { visible?: boolean };
export type MapViewData = {
  id: MapId;
  regions: ViewRegion[];
  places: ViewPlace[];
  roads: { d: string; open?: boolean }[];
  party: { x: number; y: number } | null;
  tokens?: ViewToken[];
  notes: MapNote[];
};

const ringsPath = (shape: number[][][]) => shape.map((r) => 'M' + r.map((q) => `${q[0]},${q[1]}`).join('L') + 'Z').join('');
const PAPER = '#f3ecd9';
let seq = 0;

/** Значок места по виду. Цвета и формы — из макетов. */
export function PlaceIcon({ kind, ink }: { kind: PlaceKind; ink: string | null }) {
  switch (kind) {
    case 'capital':
    case 'bigtown': {
      const c = ink ?? '#2b3d5c';
      return (
        <>
          <circle r={12} fill={PAPER} stroke={c} strokeWidth={2.4} />
          <circle r={15.5} fill="none" stroke={c} strokeWidth={0.8} />
          <path d="M0 -6.5 l6.5 6.5 l-6.5 6.5 l-6.5 -6.5z" fill={c} />
        </>
      );
    }
    case 'city':
    case 'town':
      return <rect x={-5.5} y={-5.5} width={11} height={11} rx={2} fill={ink ?? '#2b3d5c'} stroke={PAPER} strokeWidth={1.6} />;
    case 'elven':
      return (
        <>
          <path d="M0 -10 C7 -3 7 4 0 10 C-7 4 -7 -3 0 -10Z" fill="#3f6b3f" stroke={PAPER} strokeWidth={1.6} />
          <path d="M0 -6 V7" stroke={PAPER} strokeWidth={1} />
        </>
      );
    case 'college':
      return <path d="M0 -11 L2.8 -3.4 L11 -3.4 L4.4 1.6 L6.8 9.6 L0 4.8 L-6.8 9.6 L-4.4 1.6 L-11 -3.4 L-2.8 -3.4Z" fill="#6a4a8c" stroke={PAPER} strokeWidth={1.4} />;
    case 'village':
      return <circle r={3.4} fill={PAPER} stroke="#5b4630" strokeWidth={1.4} />;
    case 'camp':
      return (
        <>
          <path d="M0 -10 L10 6 H-10Z" fill="#7a5a2a" stroke={PAPER} strokeWidth={1.5} strokeLinejoin="round" />
          <path d="M0 -10 L0 6 M-3 6 L0 0 L3 6" stroke={PAPER} strokeWidth={1} fill="none" />
        </>
      );
    case 'church':
      return (
        <>
          <path d="M-7 8 V-2 L0 -8 L7 -2 V8Z" fill="#5a4a36" stroke={PAPER} strokeWidth={1.4} />
          <path d="M0 -16 V-8 M-3 -13 H3" stroke="#5a4a36" strokeWidth={1.6} />
        </>
      );
    case 'crypt':
      return (
        <>
          <path d="M-8 8 V-2 A8 8 0 0 1 8 -2 V8Z" fill="#3c6e86" stroke={PAPER} strokeWidth={1.5} />
          <path d="M-3 8 V2 A3 3 0 0 1 3 2 V8" fill={PAPER} />
        </>
      );
    case 'cult':
      return (
        <>
          <circle r={9} fill="#c49a2c" stroke={PAPER} strokeWidth={1.5} />
          <path d="M0 -5 a5 5 0 1 1 -4.3 7.5" fill="none" stroke="#4b1d52" strokeWidth={1.6} />
        </>
      );
    case 'vampire':
      return (
        <>
          <circle r={19} fill="#8a1c1c" opacity={0.16} />
          <path transform="scale(1.35)" d="M-9 -6 H9 L6 4 L3 -1 L0 7 L-3 -1 L-6 4Z" fill="#8a1c1c" stroke={PAPER} strokeWidth={1.4} strokeLinejoin="round" />
        </>
      );
    case 'lake':
    case 'storm':
      return <circle r={6} fill="transparent" />;
    case 'mark':
      return (
        <g transform="translate(0 -2)">
          <path d="M0 0 c0 -16 24 -16 24 0 c0 11 -12 24 -12 24 c0 0 -12 -13 -12 -24z" transform="translate(-12 -22)" fill="#7a3522" stroke={PAPER} strokeWidth={2} />
          <circle cx={0} cy={-22} r={4} fill={PAPER} />
        </g>
      );
  }
}

const big = (k: PlaceKind) => k === 'capital' || k === 'bigtown';
/** Подпись места: сторона, отступ и размер — как в макетах. У озера и бури подпись снизу, курсивом. */
function labelOf(p: ViewPlace) {
  const special = p.kind === 'lake' || p.kind === 'storm';
  const off = big(p.kind) ? 20 : 13;
  const below = p.kind === 'lake' ? 76 : p.kind === 'storm' ? 128 : big(p.kind) ? 36 : 30;
  const lx = p.side === 'l' ? p.x - off : p.side === 'r' ? p.x + off : p.x;
  const ly = p.side === 'b' ? p.y + below : p.y + 6;
  return {
    lx,
    ly,
    anchor: p.side === 'l' ? 'end' : p.side === 'r' ? 'start' : 'middle',
    size: big(p.kind) ? 27 : p.kind === 'village' ? 15 : p.kind === 'storm' ? 26 : p.kind === 'lake' ? 21 : 19,
    italic: special || p.kind === 'village',
    fill: p.kind === 'storm' ? '#4b1d52' : p.kind === 'lake' ? '#2e4e60' : '#2e2416',
  } as const;
}

export type MapViewProps = {
  data: MapViewData;
  mode: 'gm' | 'player' | 'table';
  selected?: string | null;
  onPlace?: (id: string) => void;
  /** мастер перетащил место (координаты карты) */
  onPlaceMove?: (id: string, x: number, y: number) => void;
  /** нажатие по пустому месту карты (координаты карты) */
  onPick?: (x: number, y: number) => void;
  /** нажатие по открытому региону со ссылкой на другую карту */
  onRegion?: (r: ViewRegion) => void;
  onNote?: (n: MapNote) => void;
  selectedToken?: string | null;
  /** мастер нажал фигурку */
  onToken?: (id: string) => void;
  /** мастер перетащил фигурку (координаты карты) */
  onTokenMove?: (id: string, x: number, y: number) => void;
  camera?: (c: MapCamera) => void;
  /** без полётов камеры (стол с «Анимация выкл.») */
  instant?: boolean;
  className?: string;
  /** кнопки поверх карты (масштаб, легенда) */
  children?: ReactNode;
};

export function MapView({
  data,
  mode,
  selected,
  onPlace,
  onPlaceMove,
  onPick,
  onRegion,
  onNote,
  selectedToken,
  onToken,
  onTokenMove,
  camera: external,
  instant,
  className,
  children,
}: MapViewProps) {
  useEffect(() => ensureMapFonts(), []);
  const art = useArt(data.id);
  const box = useRef<HTMLDivElement>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const cam = useCamera(box, { reducedMotion: reduced || instant });
  // Камеру отдаём наружу один раз: её функции работают через ref и motion-значения и не устаревают.
  useEffect(() => external?.(cam), []); // только при появлении карты
  const p = useMemo(() => `zgm${++seq}`, []);

  // Колесо над картой не прокручивает страницу.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  const gm = mode === 'gm';
  const shown = gm ? data.regions : data.regions.filter((r) => r.visible !== false);
  const hidden = gm ? data.regions.filter((r) => r.visible === false) : [];
  const places = gm ? data.places : data.places.filter((x) => x.visible !== false);
  const roads = gm ? data.roads : data.roads.filter((r) => r.open !== false);
  const fogRegions = data.regions.filter((r) => r.visible !== false);
  const tokens = gm ? (data.tokens ?? []) : (data.tokens ?? []).filter((t) => t.visible !== false);

  // Перетаскивание места мастером.
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const placeDown = (id: string) => (e: RPointerEvent) => {
    if (!gm || !onPlaceMove) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { id, moved: false };
  };
  const ghost = useRef<SVGGElement | null>(null);
  const placeMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    const q = cam.toMap(e.clientX, e.clientY);
    const g = (e.currentTarget as SVGGElement).querySelector('[data-pin]');
    g?.setAttribute('transform', `translate(${q.x} ${q.y})`);
    ghost.current = e.currentTarget as SVGGElement;
  };
  const placeUp = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      const q = cam.toMap(e.clientX, e.clientY);
      onPlaceMove?.(d.id, Math.round(Math.min(1600, Math.max(0, q.x)) * 10) / 10, Math.round(Math.min(1100, Math.max(0, q.y)) * 10) / 10);
    } else onPlace?.(d.id);
  };

  const pick = (e: RMouseEvent) => {
    if (cam.wasDrag() || !onPick) return;
    const q = cam.toMap(e.clientX, e.clientY);
    onPick(q.x, q.y);
  };

  return (
    <div ref={box} className={cn('relative touch-none overflow-hidden overscroll-contain bg-[#e7dcbf] select-none', className)} {...cam.handlers} onClick={pick}>
      <m.div className="absolute top-0 left-0 h-[1100px] w-[1600px] origin-top-left" style={{ x: cam.x, y: cam.y, scale: cam.k, willChange: cam.moving ? 'transform' : 'auto' }}>
        {art ? (
          <svg viewBox="0 0 1600 1100" width={1600} height={1100} className="block" role="img" aria-label="Карта">
            <defs>
              <PaperDefs p={p} seed={data.id === 'world' ? 7 : data.id === 'razdolye' ? 9 : 19} />
              <ArtDefs art={art} p={p} />
              {shown.map((r) => (
                <clipPath key={r.id} id={`${p}-r-${r.id}`}>
                  <path d={ringsPath(r.shape)} />
                </clipPath>
              ))}
              {shown.map((r) => r.label.path && <path key={r.id} id={`${p}-l-${r.id}`} d={r.label.path} />)}
              <filter id={`${p}-fogb`} x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation={28} />
              </filter>
              <filter id={`${p}-fogn`} x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency=".008" numOctaves={3} seed={77} />
                <feColorMatrix values="0 0 0 0 .55  0 0 0 0 .54  0 0 0 0 .5  0 0 0 .55 .45" />
              </filter>
              <mask id={`${p}-fog`}>
                <rect width="1600" height="1100" fill="white" />
                <g filter={`url(#${p}-fogb)`} fill="black">
                  {fogRegions.map((r) => (
                    <path key={r.id} d={ringsPath(r.shape)} className="zg-fog-open" />
                  ))}
                </g>
              </mask>
              <pattern id={`${p}-hatch`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="10" height="10" fill="#3a2c1c" fillOpacity={0.08} />
                <path d="M0 0 V10" stroke="#3a2c1c" strokeWidth={1.4} strokeOpacity={0.35} />
              </pattern>
            </defs>

            <ArtBase art={art} p={p} />
            {/* заливки регионов (тон земли) */}
            <g style={{ mixBlendMode: 'multiply' }} opacity={0.5} filter={`url(#${p}-wash)`}>
              {shown.map((r) => r.fill && <path key={r.id} d={ringsPath(r.shape)} fill={r.fill} />)}
              {shown.flatMap((r) => r.extra.map((x, i) => <path key={`${r.id}-${i}`} d={ringsPath(x.shape)} fill={x.fill} />))}
            </g>
            {shown
              .filter((r) => r.border)
              .map((r) => (
                <g key={r.id} clipPath={`url(#${p}-r-${r.id})`}>
                  <path d={ringsPath(r.shape)} fill="none" stroke={r.edge} strokeWidth={26} opacity={0.38} filter={`url(#${p}-glow)`} />
                </g>
              ))}
            <ArtRelief p={p} />
            <ArtTop art={art} p={p} />
            {shown
              .filter((r) => r.border)
              .map((r) => (
                <g key={r.id}>
                  <path d={ringsPath(r.shape)} fill="none" stroke="#f5eedb" strokeWidth={4} opacity={0.7} />
                  <path d={ringsPath(r.shape)} fill="none" stroke="#5b4630" strokeWidth={1.5} strokeDasharray="7 3 1.5 3" strokeLinecap="round" opacity={0.85} />
                </g>
              ))}
            {roads.map((r, i) => (
              <path key={i} d={r.d} fill="none" stroke="#7a5b3a" strokeWidth={1.6} strokeDasharray="1 5" strokeLinecap="round" opacity={r.open === false ? 0.45 : 0.9} />
            ))}

            {/* туман: всё, кроме открытых регионов. Мастеру — без тумана, скрытое заштриховано. */}
            {!gm && (
              <g pointerEvents="none">
                <rect width="1600" height="1100" fill="#e9dfc4" mask={`url(#${p}-fog)`} />
                <rect width="1600" height="1100" filter={`url(#${p}-fogn)`} mask={`url(#${p}-fog)`} />
              </g>
            )}
            {hidden.map((r) => (
              <path key={r.id} d={ringsPath(r.shape)} fill={`url(#${p}-hatch)`} stroke="#3a2c1c" strokeOpacity={0.35} strokeDasharray="4 4" pointerEvents="none" />
            ))}
            <ArtPaper art={art} p={p} />

            {/* подписи регионов */}
            {shown.map((r) => {
              const l = r.label;
              const dim = gm && r.visible === false;
              const style = {
                fontFamily: l.italic ? "'Cormorant Garamond', Georgia, serif" : "'Cormorant SC', Georgia, serif",
                fontWeight: l.italic ? 500 : 600,
                fontStyle: l.italic ? 'italic' : undefined,
              };
              const common = {
                fill: l.ink,
                fillOpacity: l.muted ? 0.7 : 0.82,
                stroke: '#f3ecd9',
                strokeOpacity: 0.8,
                strokeWidth: l.muted ? 0 : 5,
                paintOrder: 'stroke' as const,
                fontSize: l.size,
                letterSpacing: l.spacing ?? 0,
                opacity: dim ? 0.45 : 1,
                style,
              };
              const linked = !!r.link && !!onRegion && (gm || r.visible !== false);
              const click = linked
                ? (e: RMouseEvent) => {
                    e.stopPropagation();
                    onRegion?.(r);
                  }
                : undefined;
              return l.path ? (
                <text key={r.id} {...common} onClick={click} className={cn(linked && 'cursor-pointer')}>
                  <textPath href={`#${p}-l-${r.id}`} startOffset="50%" textAnchor="middle">
                    {r.name.toUpperCase()}
                    {linked ? ' ›' : ''}
                  </textPath>
                </text>
              ) : (
                <text
                  key={r.id}
                  {...common}
                  x={l.x}
                  y={l.y}
                  textAnchor="middle"
                  transform={l.rotate ? `rotate(${l.rotate} ${l.x} ${l.y})` : undefined}
                  onClick={click}
                  className={cn(linked && 'cursor-pointer')}
                >
                  {l.italic ? r.name : r.name.toUpperCase()}
                  {linked ? ' ›' : ''}
                </text>
              );
            })}

            {/* места */}
            {places.map((pl) => {
              const l = labelOf(pl);
              const dim = gm && pl.visible === false;
              const sel = selected === pl.id;
              return (
                <g
                  key={pl.id}
                  opacity={dim ? 0.55 : 1}
                  className={cn((onPlace || onPlaceMove) && 'cursor-pointer')}
                  onPointerDown={placeDown(pl.id)}
                  onPointerMove={placeMove}
                  onPointerUp={placeUp}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!onPlaceMove) onPlace?.(pl.id);
                  }}
                >
                  <title>{[pl.name, PLACE_KIND_LABELS[pl.kind], pl.subtitle].filter(Boolean).join(' · ')}</title>
                  <g data-pin transform={`translate(${pl.x} ${pl.y})`}>
                    {sel && <circle r={22} fill="none" stroke="#c9971f" strokeWidth={2.5} strokeDasharray="4 4" />}
                    <circle r={16} fill="transparent" />
                    <PlaceIcon kind={pl.kind} ink={pl.ink} />
                  </g>
                  {pl.name && (
                    <text
                      x={l.lx}
                      y={l.ly}
                      textAnchor={l.anchor}
                      fontSize={l.size}
                      fill={l.fill}
                      stroke="#f3ecd9"
                      strokeWidth={4}
                      paintOrder="stroke"
                      style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: l.italic ? 600 : 700, fontStyle: l.italic ? 'italic' : undefined }}
                    >
                      {pl.name}
                    </text>
                  )}
                  {pl.subtitle && (
                    <text
                      x={l.lx}
                      y={l.ly + 18}
                      textAnchor={l.anchor}
                      fontSize={15}
                      fill="#5a4630"
                      stroke="#f3ecd9"
                      strokeWidth={3.5}
                      paintOrder="stroke"
                      style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: 'italic' }}
                    >
                      {pl.subtitle}
                    </text>
                  )}
                </g>
              );
            })}

            {/* маркер партии */}
            {data.party && (
              <g transform={`translate(${data.party.x} ${data.party.y})`} pointerEvents="none" aria-label="Партия здесь">
                <circle r={22} fill="#1f7a4d" opacity={0.18} className="zg-party-pulse" />
                <path d="M0 -13 L12 9 H-12Z" fill="#1f7a4d" stroke="#f3ecd9" strokeWidth={2.2} strokeLinejoin="round" />
              </g>
            )}

            {/* личные заметки игрока */}
            {data.notes.map((n, i) => (
              <g
                key={n.id}
                transform={`translate(${n.x} ${n.y})`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onNote?.(n);
                }}
              >
                <circle r={18} fill="transparent" />
                <path d="M0 0 c0 -16 24 -16 24 0 c0 11 -12 24 -12 24 c0 0 -12 -13 -12 -24z" transform="translate(-12 -24)" fill="#9a6a12" stroke="#f3ecd9" strokeWidth={2} />
                <text y={-26} textAnchor="middle" fontSize={11} fontWeight={700} fill="#f3ecd9" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
                  {i + 1}
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="grid size-full place-items-center font-ui text-[#6b5d48]">Рисую карту…</div>
        )}
        {art && tokens.length > 0 && (
          <Suspense fallback={null}>
            <MapTokens
              tokens={tokens}
              editable={gm && !!onTokenMove}
              selected={selectedToken ?? null}
              instant={!!(reduced || instant)}
              toMap={cam.toMap}
              {...(onToken ? { onToken } : {})}
              {...(onTokenMove ? { onTokenMove } : {})}
            />
          </Suspense>
        )}
      </m.div>
      {children}
    </div>
  );
}
