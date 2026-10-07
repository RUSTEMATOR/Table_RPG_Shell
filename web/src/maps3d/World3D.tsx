import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { PLACE_KIND_LABELS, type MapNote, type PlaceKind } from '@zg/shared';
import { useArt } from '../maps/MapArt.tsx';
import { PlaceIcon, type MapViewProps, type ViewPlace, type ViewRegion } from '../maps/MapView.tsx';
import type { ViewToken } from '../maps/MapTokens.tsx';
import type { MapCamera } from '../maps/camera.ts';
import { ensureMapFonts } from '../maps/fonts.ts';
import { FigureSprite, type Dir, type Pose } from '../figure/FigureSprite.tsx';
import { capabilities } from '../lib/capabilities.ts';
import { cn } from '../lib/cn.ts';
import { flatten, midpoint } from './path.ts';
import { usePartyWalk } from '../maps/walk.ts';
import { MapScene } from './scene.ts';
import { liftOf, teamOf } from './settlements.ts';
import { loadUnit, type Unit } from './units.ts';

// 3D-карта (этап 26): те же данные и те же обработчики, что у пергамента (MapViewProps), — экраны игрока, мастера
// и стола меняются только в месте вызова. Сцена — MapScene (three.js), поверх — HTML: подписи мест и земель,
// фигурки, знамя отряда, заметки. Слой подписей — сосед холста, а не его потомок: нажатие на подпись не двигает камеру.

const TEAM_COLOR = { blue: '#3b5f9a', red: '#9a3b2f', yellow: '#b08a1e', green: '#3f7a3f' } as const;
const SPEED = 260;
const dirOf = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
const ramp = (z: number, a: number, b: number) => Math.min(1, Math.max(0, (z - a) / (b - a)));

/** Важность подписи места: при наложении остаётся важнейшая. */
const PRIORITY: Record<PlaceKind, number> = {
  capital: 60,
  bigtown: 50,
  city: 40,
  college: 40,
  elven: 40,
  storm: 35,
  town: 30,
  church: 25,
  camp: 22,
  crypt: 22,
  cult: 22,
  vampire: 20,
  lake: 20,
  village: 10,
  mark: 15,
};

export function World3D({
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
  camera,
  instant,
  route,
  placeHint,
  follow,
  className,
  children,
}: MapViewProps) {
  useEffect(() => ensureMapFonts(), []);
  const host = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<MapScene | null>(null);
  const [ready, setReady] = useState(false);
  const art = useArt(data.id);
  const reduced = capabilities.reducedMotion();

  useEffect(() => {
    const s = new MapScene(host.current!, mode, { touch: capabilities.touch() });
    setScene(s);
    return () => {
      s.dispose();
      setScene(null);
      setReady(false);
    };
  }, [mode]);

  useEffect(() => {
    if (scene) scene.instant = !!instant || reduced;
  }, [scene, instant, reduced]);

  // камера наружу — один раз на сцену
  useEffect(() => {
    if (!scene) return;
    const c: MapCamera = {
      toMap: (cx, cy) => scene.cam.toMap(cx, cy) ?? { x: scene.cam.x, y: scene.cam.y },
      flyTo: (x, y, zoom, o) => scene.cam.flyTo(x, y, zoom, { ...o, instant: o?.instant || scene.instant }),
      zoomBy: (f) => scene.cam.zoomBy(f),
      view: () => scene.cam.view(),
      onChange: (fn) => scene.onFrame(fn),
      north: () => scene.cam.north(),
      yaw: () => scene.cam.yaw,
      orbit: (x, y, on) => {
        if (!on) {
          scene.cam.spin = 0;
          scene.cam.tilt = 0;
          return;
        }
        scene.cam.flyTo(x, y, 6, { duration: 1.4, instant: scene.instant });
        scene.cam.tilt = -0.12;
        scene.cam.spin = scene.instant ? 0 : 0.07;
        scene.requestRender();
      },
    };
    camera?.(c);
  }, [scene]); // camera — колбэк экрана, меняться не должен

  useEffect(() => {
    if (!scene || !art) return;
    let alive = true;
    setReady(false);
    void scene.setArt(art).then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [scene, art]);

  useEffect(() => {
    if (scene && ready) scene.setData(data);
  }, [scene, ready, data]);

  useEffect(() => {
    if (scene && ready) scene.setRoute(route ?? null);
  }, [scene, ready, route]);

  const gm = mode === 'gm';
  const places = gm ? data.places : data.places.filter((p) => p.visible !== false);
  const regions = gm ? data.regions : data.regions.filter((r) => r.visible !== false);
  const tokens = gm ? (data.tokens ?? []) : (data.tokens ?? []).filter((t) => t.visible !== false);

  // нажатие по земле: рядом с местом — это место, иначе — точка карты
  const click = (e: { clientX: number; clientY: number }) => {
    if (!scene || scene.cam.wasDrag()) return;
    const r = host.current!.getBoundingClientRect();
    const sx = e.clientX - r.left,
      sy = e.clientY - r.top;
    let best: { id: string; d: number } | null = null;
    for (const p of places) {
      const q = scene.project(p.x, p.y, liftOf(p.kind) * 0.4);
      const d = Math.hypot(q.x - sx, q.y - sy);
      if (q.visible && d < 30 && (!best || d < best.d)) best = { id: p.id, d };
    }
    if (best && onPlace) return onPlace(best.id);
    const q = scene.cam.toMap(e.clientX, e.clientY);
    if (q) onPick?.(q.x, q.y);
  };

  return (
    <div className={cn('relative overflow-hidden bg-[#c9d6dc] select-none', className)}>
      <div
        ref={host}
        tabIndex={0}
        aria-label="Карта в 3D: тащить — сдвиг, колесо или два пальца — масштаб, правая кнопка или Q/E — поворот, WASD — движение"
        className="absolute inset-0 touch-none overscroll-contain outline-none"
        onClick={click}
        onKeyDown={(e) => {
          if (!scene) return;
          if (e.code === 'Space' && data.party) {
            e.preventDefault();
            scene.cam.flyTo(data.party.x, data.party.y, 3.2, { duration: 0.9, instant: scene.instant });
          } else if (e.code === 'Home') scene.cam.flyTo(800, 550, 1, { duration: 0.9, instant: scene.instant });
          else if (e.code === 'KeyN') scene.cam.north();
        }}
      />
      {scene && ready && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {regions.map((r) => (
            <RegionLabel key={r.id} scene={scene} r={r} gm={gm} {...(onRegion ? { onRegion } : {})} />
          ))}
          {places.map((p) => (
            <PlaceLabel
              key={p.id}
              scene={scene}
              p={p}
              gm={gm}
              selected={selected === p.id}
              hint={placeHint?.(p.id) ?? null}
              {...(onPlace ? { onPlace } : {})}
              {...(onPlaceMove ? { onPlaceMove } : {})}
            />
          ))}
          {data.party && <PartyBanner scene={scene} party={data.party} instant={!!instant || reduced} follow={!!follow} />}
          {tokens.map((t) => (
            <Token3D
              key={t.id}
              scene={scene}
              t={t}
              editable={gm && !!onTokenMove}
              selected={selectedToken === t.id}
              instant={!!instant || reduced}
              {...(onToken ? { onToken } : {})}
              {...(onTokenMove ? { onTokenMove } : {})}
            />
          ))}
          {data.notes.map((n, i) => (
            <NotePin key={n.id} scene={scene} n={n} i={i} {...(onNote ? { onNote } : {})} />
          ))}
        </div>
      )}
      {!ready && <div className="pointer-events-none absolute inset-0 grid place-items-center font-ui text-[#4a5a60]">Строю мир…</div>}
      {children}
    </div>
  );
}

/** Привязка HTML-элемента к точке карты (положение пересчитывает сцена после каждого кадра). */
function Anchored({
  scene,
  pos,
  size,
  min,
  max,
  fade,
  priority,
  className,
  children,
}: {
  scene: MapScene;
  pos: () => { x: number; y: number; lift: number } | null;
  size?: number;
  min?: number;
  max?: number;
  fade?: (zoom: number) => number;
  /** подпись: участвует в раскладке без наложений, больше — важнее */
  priority?: number;
  className?: string;
  children: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const fadeRef = useRef(fade);
  fadeRef.current = fade;
  const priRef = useRef(priority);
  priRef.current = priority;
  useEffect(
    () =>
      scene.anchor({
        el: el.current!,
        pos: () => posRef.current(),
        ...(size ? { size } : {}),
        ...(min ? { min } : {}),
        ...(max ? { max } : {}),
        ...(fade ? { fade: (z: number) => fadeRef.current?.(z) ?? 1 } : {}),
        ...(priority !== undefined ? { priority: () => priRef.current ?? 0 } : {}),
      }),
    [scene, size, min, max, !!fade, priority !== undefined],
  );
  useEffect(() => scene.requestRender());
  return (
    <div ref={el} className={cn('group absolute top-0 left-0 size-0', className)} style={{ visibility: 'hidden', transformOrigin: '0 0' }}>
      {children}
    </div>
  );
}

function PlaceLabel({
  scene,
  p,
  gm,
  selected,
  hint,
  onPlace,
  onPlaceMove,
}: {
  scene: MapScene;
  p: ViewPlace;
  gm: boolean;
  selected: boolean;
  hint: string | null;
  onPlace?: (id: string) => void;
  onPlaceMove?: (id: string, x: number, y: number) => void;
}) {
  const at = useRef({ x: p.x, y: p.y });
  useEffect(() => {
    at.current = { x: p.x, y: p.y };
    scene.requestRender();
  }, [p.x, p.y, scene]);
  const drag = useRef<{ moved: boolean; sx: number; sy: number } | null>(null);
  const big = p.kind === 'capital' || p.kind === 'bigtown';
  const team = TEAM_COLOR[teamOf(p.ink, p.kind)];
  const named = !!p.name;
  // безымянные деревни — точкой, только вблизи; остальные подписи видны всегда, наложения убирает сцена
  const fade = useMemo(() => (named ? undefined : (z: number) => ramp(z, gm ? 1.5 : 2, gm ? 1.8 : 2.4)), [named, gm]);
  const priority = PRIORITY[p.kind] + (selected ? 1000 : 0) + (named ? 0 : -5);
  const hidden = gm && p.visible === false;

  const down = (e: RPointerEvent) => {
    if (!onPlace && !onPlaceMove) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { moved: false, sx: e.clientX, sy: e.clientY };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !onPlaceMove) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
    d.moved = true;
    const q = scene.cam.toMap(e.clientX, e.clientY);
    if (q) at.current = q;
    scene.requestRender();
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved && onPlaceMove) onPlaceMove(p.id, Math.round(Math.min(1600, Math.max(0, at.current.x)) * 10) / 10, Math.round(Math.min(1100, Math.max(0, at.current.y)) * 10) / 10);
    else onPlace?.(p.id);
  };

  return (
    <Anchored scene={scene} pos={() => ({ x: at.current.x, y: at.current.y, lift: liftOf(p.kind) })} {...(fade ? { fade } : {})} priority={priority}>
      <div
        className={cn(
          'absolute bottom-0 left-0 flex -translate-x-1/2 flex-col items-center pb-0.5',
          (onPlace || onPlaceMove) && 'pointer-events-auto cursor-pointer',
          onPlaceMove && 'active:cursor-grabbing',
        )}
        style={{ opacity: hidden ? 0.6 : 1 }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        role={onPlace ? 'button' : undefined}
        aria-label={`${p.name || PLACE_KIND_LABELS[p.kind]}${hidden ? ' (скрыто)' : ''}`}
        title={[p.name, PLACE_KIND_LABELS[p.kind], p.subtitle, hint].filter(Boolean).join(' · ')}
      >
        {named ? (
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-md border border-solid py-0.5 pr-2.5 pl-1 whitespace-nowrap group-data-[far]:gap-1 group-data-[far]:pr-1.5 shadow-[0_4px_12px_rgba(20,16,10,.35)] transition-[outline-color]',
              hidden && 'border-dashed',
              selected ? 'outline-[2.5px] outline-offset-2 outline-[#e0b23a] outline-solid' : 'outline-transparent',
            )}
            style={{ background: 'rgba(32,26,18,.78)', borderColor: 'rgba(243,236,217,.35)', borderLeft: `4px solid ${team}` }}
          >
            <svg
              viewBox="-17 -17 34 34"
              aria-hidden="true"
              className={cn('shrink-0', big ? 'size-[22px] group-data-[far]:size-[17px]' : 'size-[17px] group-data-[far]:size-[13px]')}
            >
              <PlaceIcon kind={p.kind} ink={p.ink} />
            </svg>
            <span className="grid leading-[1.05]">
              <span
                className={cn(
                  'text-[#f3ecd9]',
                  big ? 'text-[19px] group-data-[far]:text-[16px]' : p.kind === 'village' ? 'text-[14px] group-data-[far]:text-[12px]' : 'text-[16px] group-data-[far]:text-[13px]',
                )}
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontStyle: p.kind === 'village' ? 'italic' : undefined }}
              >
                {p.name}
              </span>
              {p.subtitle && (
                <span className="text-[#d6c9a8] group-data-[far]:hidden" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: 'italic', fontSize: 12.5 }}>
                  {p.subtitle}
                </span>
              )}
            </span>
          </span>
        ) : (
          <span
            className={cn(
              'block size-3 rounded-full border-2 border-solid border-[#f3ecd9] shadow-[0_2px_6px_rgba(20,16,10,.45)]',
              selected && 'outline-2 outline-offset-2 outline-[#e0b23a] outline-solid',
            )}
            style={{ background: '#5b4630' }}
          />
        )}
        {named && <span aria-hidden="true" className="mt-[-1px] size-0 border-x-[6px] border-t-[7px] border-solid border-x-transparent border-t-[rgba(32,26,18,.78)]" />}
      </div>
    </Anchored>
  );
}

function RegionLabel({ scene, r, gm, onRegion }: { scene: MapScene; r: ViewRegion; gm: boolean; onRegion?: (r: ViewRegion) => void }) {
  const at = useMemo(() => {
    if (r.label.path) {
      const line = flatten(r.label.path, 6)[0];
      if (line) return midpoint(line);
    }
    return { x: r.label.x ?? 0, y: r.label.y ?? 0 };
  }, [r.label]);
  const linked = !!r.link && !!onRegion;
  const dim = gm && r.visible === false;
  return (
    <Anchored scene={scene} pos={() => ({ x: at.x, y: at.y, lift: 30 })} fade={(z) => (1 - ramp(z, 1.8, 2.6)) * (dim ? 0.5 : 1)} priority={1}>
      <button
        type="button"
        tabIndex={linked ? 0 : -1}
        disabled={!linked}
        onClick={() => onRegion?.(r)}
        className={cn(
          'absolute bottom-0 left-0 -translate-x-1/2 border-0 bg-transparent p-0 whitespace-nowrap uppercase',
          linked ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
        )}
        style={{
          fontFamily: "'Cormorant SC', Georgia, serif",
          fontWeight: 700,
          fontSize: Math.max(18, Math.min(30, r.label.size * 0.75)),
          letterSpacing: (r.label.spacing ?? 2) * 0.6,
          color: '#fbf6e8',
          textShadow: `0 0 2px ${r.edge}, 0 2px 10px rgba(20,16,10,.85), 0 0 18px ${r.edge}`,
        }}
      >
        {r.name}
        {linked ? ' ›' : ''}
      </button>
    </Anchored>
  );
}

function PartyBanner({ scene, party, instant, follow }: { scene: MapScene; party: NonNullable<MapViewProps['data']['party']>; instant: boolean; follow: boolean }) {
  const at = useRef({ x: party.x, y: party.y });
  const walking = useRef(false);
  useEffect(() => {
    if (walking.current) return;
    at.current = { x: party.x, y: party.y };
    scene.requestRender();
  }, [party.x, party.y, scene]);
  // поход по дороге (этап 28): знамя идёт по пути; на столе камера следует за ним
  const release = useRef<(() => void) | null>(null);
  const [pose, setPose] = useState<Pose>('idle');
  const [dir, setDir] = useState<Dir>('down');
  const figures = (party.figures ?? []).filter((f) => f.figure);
  usePartyWalk(party, {
    instant,
    onStart: () => {
      walking.current = true;
      release.current = scene.hold();
      setPose('walk');
    },
    onStep: (q) => {
      // направление — по экрану (камера могла повернуть карту)
      const a = scene.project(at.current.x, at.current.y),
        b = scene.project(q.x, q.y);
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.5) setDir(dirOf(b.x - a.x, b.y - a.y));
      at.current = { x: q.x, y: q.y };
      if (follow) {
        scene.cam.x = q.x;
        scene.cam.y = q.y;
        scene.cam.apply();
      }
    },
    onEnd: () => {
      walking.current = false;
      setPose('idle');
      setDir('down');
      at.current = { x: party.x, y: party.y };
      release.current?.();
      release.current = null;
    },
  });
  return (
    <Anchored scene={scene} pos={() => ({ x: at.current.x, y: at.current.y, lift: 0 })} size={34} min={0.55} max={1.4}>
      <div aria-label={figures.length ? `Отряд: ${figures.map((f) => f.name).join(', ')}` : 'Отряд здесь'} className="absolute bottom-0 left-0">
        <span aria-hidden="true" className="zg-party-pulse absolute bottom-[-10px] left-[-40px] h-[20px] w-[80px] rounded-[50%] bg-[#1f7a4d]/30" />
        {/* знамя отряда — за фигурками */}
        <svg
          viewBox="0 0 60 86"
          width={60}
          height={86}
          className="absolute bottom-0 left-[-8px] drop-shadow-[0_4px_6px_rgba(20,16,10,.45)]"
          style={{ opacity: figures.length ? 0.9 : 1 }}
        >
          <path d="M8 86 V4" stroke="#3a2c1c" strokeWidth={3.5} strokeLinecap="round" />
          <circle cx={8} cy={4} r={3.5} fill="#c9971f" />
          <path d="M10 8 H54 L46 22 L54 36 H10Z" fill="#1f7a4d" stroke="#f3ecd9" strokeWidth={2} strokeLinejoin="round" />
          <path d="M22 16 l6 6 l10 -10" fill="none" stroke="#f3ecd9" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
        </svg>
        {figures.slice(0, 5).map((f, i) => {
          const off = (
            [
              [0, 0],
              [-30, -10],
              [30, -10],
              [-58, -18],
              [58, -18],
            ] as const
          )[i]!;
          return (
            <div key={`${f.name}-${i}`} className="absolute" style={{ left: off[0] - 40, bottom: -off[1] - 4, width: 80, height: 80, zIndex: 10 - i }}>
              <FigureSprite figure={f.figure!} pose={pose} dir={dir} size={80} className="pointer-events-none absolute inset-0" />
            </div>
          );
        })}
      </div>
    </Anchored>
  );
}

function NotePin({ scene, n, i, onNote }: { scene: MapScene; n: MapNote; i: number; onNote?: (n: MapNote) => void }) {
  return (
    <Anchored scene={scene} pos={() => ({ x: n.x, y: n.y, lift: 0 })}>
      <button
        type="button"
        aria-label={`Заметка ${i + 1}: ${n.text}`}
        onClick={() => onNote?.(n)}
        className="pointer-events-auto absolute bottom-0 left-0 grid h-[30px] w-[24px] -translate-x-1/2 cursor-pointer place-items-start border-0 bg-transparent p-0"
      >
        <svg viewBox="0 0 24 30" width={24} height={30} className="absolute inset-0 drop-shadow-[0_2px_4px_rgba(20,16,10,.4)]" aria-hidden="true">
          <path d="M12 29 C12 29 1 17 1 11 A11 11 0 0 1 23 11 C23 17 12 29 12 29Z" fill="#9a6a12" stroke="#f3ecd9" strokeWidth={2} />
        </svg>
        <span className="relative w-full pt-[3px] text-center font-ui text-[11px] font-bold text-[#f3ecd9]">{i + 1}</span>
      </button>
    </Anchored>
  );
}

function Token3D({
  scene,
  t,
  editable,
  selected,
  instant,
  onToken,
  onTokenMove,
}: {
  scene: MapScene;
  t: ViewToken;
  editable: boolean;
  selected: boolean;
  instant: boolean;
  onToken?: (id: string) => void;
  onTokenMove?: (id: string, x: number, y: number) => void;
}) {
  const cur = useRef({ x: t.x, y: t.y });
  const held = useRef(false);
  const [pose, setPose] = useState<Pose>('idle');
  const [dir, setDir] = useState<Dir>('down');
  // 3D-модель противника (этап 34) вместо спрайта; не загрузилась — остаётся фигурка
  const heading = useRef(0);
  const [unit, setUnit] = useState<Unit | null>(null);
  const hidden = t.visible === false;
  useEffect(() => {
    if (!t.model) return;
    let alive = true;
    let remove: (() => void) | null = null;
    void loadUnit(t.model, scene.castsShadows).then((u) => {
      if (!alive || !u) return;
      remove = scene.addUnit(u, () => ({ x: cur.current.x, y: cur.current.y, heading: heading.current }));
      setUnit(u);
    });
    return () => {
      alive = false;
      remove?.();
      setUnit(null);
    };
  }, [t.model, scene]);
  useEffect(() => {
    unit?.setOpacity(hidden ? 0.5 : 1);
    scene.requestRender();
  }, [unit, hidden, scene]);
  useEffect(() => {
    unit?.setWalking(pose === 'walk');
    scene.requestRender();
  }, [unit, pose, scene]);

  // новая точка — фигурка идёт к ней (по экрану — в сторону движения)
  useEffect(() => {
    const from = { ...cur.current };
    const to = { x: t.x, y: t.y };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist < 1) return;
    if (instant || dist < 4 || held.current) {
      held.current = false;
      cur.current = to;
      scene.requestRender();
      return;
    }
    const d = Math.min(2.6, Math.max(0.4, dist / SPEED));
    const a = scene.project(from.x, from.y),
      b = scene.project(to.x, to.y);
    setDir(dirOf(b.x - a.x, b.y - a.y));
    // модель смотрит по ходу: +z рельефа — вниз по карте
    heading.current = Math.atan2(to.x - from.x, to.y - from.y);
    setPose('walk');
    const release = scene.hold();
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / (d * 1000));
      cur.current = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        setPose('idle');
        release();
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      release();
    };
  }, [t.x, t.y]); // instant и scene — на момент прихода новых координат

  const drag = useRef<{ moved: boolean; sx: number; sy: number } | null>(null);
  const down = (e: RPointerEvent) => {
    if (!editable && !onToken) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { moved: false, sx: e.clientX, sy: e.clientY };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !editable) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    d.moved = true;
    const q = scene.cam.toMap(e.clientX, e.clientY);
    if (q) cur.current = q;
    scene.requestRender();
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) return onToken?.(t.id);
    held.current = true;
    const x = Math.round(Math.min(1600, Math.max(0, cur.current.x)) * 10) / 10;
    const y = Math.round(Math.min(1100, Math.max(0, cur.current.y)) * 10) / 10;
    cur.current = { x, y };
    onTokenMove?.(t.id, x, y);
  };

  const ring = t.kind === 'npc' ? '#8a1c1c' : '#1f7a4d';
  const S = 100;
  return (
    <Anchored scene={scene} pos={() => ({ x: cur.current.x, y: cur.current.y, lift: 0 })} size={30} min={0.3} max={1.5}>
      <div
        className={cn('absolute bottom-[-8px] left-0 -translate-x-1/2', (editable || onToken) && 'pointer-events-auto', editable && 'cursor-grab active:cursor-grabbing')}
        style={{ width: S, height: S + 8, opacity: hidden && !unit ? 0.5 : 1 }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        role={onToken ? 'button' : 'img'}
        aria-label={`${t.name || 'Фигурка'}${hidden ? ' (скрыта)' : ''}`}
      >
        <span
          aria-hidden="true"
          className={cn('absolute left-1/2 -translate-x-1/2 rounded-[50%] border-solid', hidden && 'border-dashed')}
          style={{
            bottom: 0,
            width: S * 0.56,
            height: 16,
            background: `color-mix(in srgb, ${ring} 35%, transparent)`,
            borderWidth: t.mine ? 3 : 2,
            borderColor: t.mine ? '#c9971f' : ring,
            boxShadow: '0 3px 6px rgba(20,16,10,.4)',
          }}
        />
        {selected && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 rounded-[50%] border-[2.5px] border-dashed border-[#e0b23a]"
            style={{ bottom: -6, width: S * 0.8, height: 28 }}
          />
        )}
        {unit ? null : t.figure ? (
          <FigureSprite figure={t.figure} pose={pose} dir={dir} size={S} className="pointer-events-none absolute top-0 left-0" />
        ) : (
          <span
            aria-hidden="true"
            className="absolute left-1/2 grid -translate-x-1/2 place-items-center rounded-full border-[3px] border-solid border-[#f3ecd9] font-ui text-[26px] font-bold text-[#f3ecd9]"
            style={{ bottom: 8, width: 46, height: 46, background: ring, boxShadow: '0 3px 8px rgba(20,16,10,.4)' }}
          >
            {(t.name.trim()[0] ?? '?').toUpperCase()}
          </span>
        )}
        {t.name && (
          <span
            className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full px-2 font-ui text-[15px] leading-[22px] font-semibold whitespace-nowrap text-[#f3ecd9]"
            style={{ background: t.mine ? '#7a5a12' : ring, boxShadow: '0 2px 5px rgba(20,16,10,.35)' }}
          >
            {t.name}
          </span>
        )}
      </div>
    </Anchored>
  );
}
