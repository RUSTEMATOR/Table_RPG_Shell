import { memo, useEffect, useState } from 'react';
import type { MapId } from '@zg/shared';

// Рельеф карт по одобренным макетам этапа 15. Слои — memo: рисунок не меняется, перерисовка карты их не трогает. Геометрия — из web/src/maps/art/*.json (tools/extract-maps), здесь только
// отрисовка. В рельефе нет имён, мест, дорог и границ регионов: их приносят данные карты (только открытое).

type Pt = { x: number; y: number };
type Mount = Pt & { s: number; light?: string; shade?: string; snow?: boolean };
type Tree = Pt & { r: number; fill: string; ink: string };
type River = { d: string; w: number; halo: number };
export type WorldArt = {
  rivers: River[];
  mounts: Mount[];
  trees: Tree[];
  woods: { d: string; base: string }[];
  hills: { d: string; c: string }[];
  fields: string[];
  dunes: string[];
  ice: string[];
  tufts: string[];
  cracks: string[];
  volcs: (Pt & { s: number })[];
};
export type RazdolyeArt = {
  land: string;
  rivers: River[];
  trees: Tree[];
  woods: { d: string; base: string }[];
  nTrees: Tree[];
  mounts: Mount[];
  nMounts: Mount[];
  hills: string[];
  fields: string[];
  twilight: Pt;
};
export type FrozenArt = {
  land: string;
  nLine: string;
  sLine: string;
  wall: string;
  merlons: (Pt & { a: number })[];
  storm: string;
  vortex: string[];
  eye: Pt;
  lake: string;
  ripples: string;
  mounts: Mount[];
  pines: { d: string; fill: string }[];
  ice: string[];
  drifts: string[];
  dunes: string[];
};
export type Art = { id: 'world'; art: WorldArt } | { id: 'razdolye'; art: RazdolyeArt } | { id: 'frozen'; art: FrozenArt };

const loaders = {
  world: () => import('./art/world.json').then((m) => ({ id: 'world' as const, art: m.default as unknown as WorldArt })),
  razdolye: () => import('./art/razdolye.json').then((m) => ({ id: 'razdolye' as const, art: m.default as unknown as RazdolyeArt })),
  frozen: () => import('./art/frozen.json').then((m) => ({ id: 'frozen' as const, art: m.default as unknown as FrozenArt })),
};
const cache = new Map<MapId, Art>();

/** Загрузить рельеф заранее (переход на соседнюю карту без «Рисую карту…»). */
export async function preloadArt(id: MapId): Promise<void> {
  if (!cache.has(id)) cache.set(id, await loaders[id]());
}

/** Рельеф карты: отдельный чанк на карту, грузится при первом показе. */
export function useArt(id: MapId): Art | null {
  const [art, setArt] = useState<Art | null>(() => cache.get(id) ?? null);
  useEffect(() => {
    let alive = true;
    const hit = cache.get(id);
    if (hit) return setArt(hit);
    setArt(null);
    void loaders[id]().then((a) => {
      cache.set(id, a);
      if (alive) setArt(a);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return art;
}

const MOUNT = 'M-13 0 C-9 -6 -5 -13 -2 -18 C1 -13 7 -6 13 0';
const MOUNT_SHADE = 'M-2 -18 C1 -13 7 -6 13 0 L1 0 C1 -6 -1 -12 -2 -18Z';

function Mountains({ list, light, shade, ink = '#3d3424', opacity }: { list: Mount[]; light?: string; shade?: string; ink?: string; opacity?: number }) {
  return (
    <g opacity={opacity}>
      {list.map((m, i) => (
        <g key={i} transform={`translate(${m.x} ${m.y}) scale(${m.s})`}>
          <path d={`${MOUNT}Z`} fill={m.light ?? light} />
          <path d={MOUNT_SHADE} fill={m.shade ?? shade} />
          <path d={MOUNT} fill="none" stroke={ink} strokeWidth={1} strokeLinejoin="round" />
          {m.snow && <path d="M-6 -9.6 C-4.6 -12.4 -3.3 -15.3 -2 -18 C-0.4 -15.3 1.6 -12.8 3.6 -10.3 L1.4 -11.4 L-0.6 -9.6 L-3.2 -11.2Z" fill="#ffffff" />}
        </g>
      ))}
    </g>
  );
}

function Trees({ list, opacity, ink }: { list: Tree[]; opacity?: number; ink?: string }) {
  return (
    <g opacity={opacity}>
      {list.map((t, i) => (
        <circle key={i} cx={t.x} cy={t.y} r={t.r} fill={t.fill} stroke={t.ink || ink} strokeWidth={t.ink ? 0.7 : 0.6} />
      ))}
    </g>
  );
}

function Rivers({ list }: { list: River[] }) {
  return (
    <>
      {list.map((v, i) => (
        <g key={i}>
          <path d={v.d} fill="none" stroke="#f3ecd9" strokeWidth={v.halo} strokeLinecap="round" />
          <path d={v.d} fill="none" stroke="#5f8c97" strokeWidth={v.w} strokeLinecap="round" />
        </g>
      ))}
    </>
  );
}

function Strokes({ list, stroke, width, opacity, cap }: { list: string[]; stroke: string; width: number; opacity: number; cap?: boolean }) {
  return <path d={list.join('')} fill="none" stroke={stroke} strokeWidth={width} opacity={opacity} strokeLinecap={cap ? 'round' : undefined} />;
}

/** Общие фильтры бумаги. p — префикс id (на странице может быть несколько карт). */
export const PaperDefs = memo(function PaperDefs({ p, seed }: { p: string; seed: number }) {
  return (
    <>
      <filter id={`${p}-grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves={3} seed={seed} />
        <feColorMatrix values="0 0 0 0 .32  0 0 0 0 .26  0 0 0 0 .16  0 0 0 .14 0" />
      </filter>
      <filter id={`${p}-relief`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves={5} seed={seed + 30} result="h" />
        <feDiffuseLighting in="h" surfaceScale={8} lightingColor="#ffffff" result="l">
          <feDistantLight azimuth={235} elevation={40} />
        </feDiffuseLighting>
        <feColorMatrix in="l" values="0 0 0 0 .28  0 0 0 0 .22  0 0 0 0 .14  -1.1 0 0 0 .95" />
      </filter>
      <filter id={`${p}-wash`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves={3} seed={seed + 3} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={12} />
      </filter>
      <filter id={`${p}-glow`} x="-5%" y="-5%" width="110%" height="110%">
        <feGaussianBlur stdDeviation={9} />
      </filter>
      <filter id={`${p}-mist`}>
        <feGaussianBlur stdDeviation={17} />
      </filter>
      <radialGradient id={`${p}-edge`} cx="50%" cy="50%" r="72%">
        <stop offset=".6" stopColor="#ece2c6" stopOpacity={0} />
        <stop offset=".92" stopColor="#e8dcbd" stopOpacity={0.7} />
        <stop offset="1" stopColor="#e3d6b4" stopOpacity={0.95} />
      </radialGradient>
    </>
  );
});

/** Нижний слой: бумага (и лёд Замёрзших земель). Заливки регионов ложатся поверх. */
export const ArtBase = memo(function ArtBase({ art, p }: { art: Art; p: string }) {
  return (
    <>
      <rect width="1600" height="1100" fill="#ece2c6" />
      {art.id === 'frozen' && <path d={art.art.land} fill="#d6e2ee" opacity={0.72} filter={`url(#${p}-wash)`} />}
    </>
  );
});

/** Светотень рельефа — поверх заливок регионов (умножением). */
export const ArtRelief = memo(function ArtRelief({ p }: { p: string }) {
  return <rect width="1600" height="1100" filter={`url(#${p}-relief)`} style={{ mixBlendMode: 'multiply' }} opacity={0.5} pointerEvents="none" />;
});

/**
 * Мягкие слои рельефа (с фильтрами: мглы, размытые леса, свечение берега и бури). Их можно запечь в картинку (bake.ts):
 * они размыты сами по себе, и растр в умеренном разрешении выглядит так же и вблизи.
 */
export const ArtSoft = memo(function ArtSoft({ art, p }: { art: Art; p: string }) {
  if (art.id === 'world') {
    const a = art.art;
    return (
      <>
        <g filter={`url(#${p}-mist)`} fill="#6a2e40" opacity={0.26}>
          <ellipse cx="250" cy="600" rx="130" ry="46" />
          <ellipse cx="330" cy="800" rx="150" ry="50" />
          <ellipse cx="240" cy="950" rx="120" ry="40" />
          <ellipse cx="400" cy="690" rx="90" ry="30" />
        </g>
        <g filter={`url(#${p}-mist)`} fill="#ffffff" opacity={0.6}>
          <ellipse cx="1260" cy="460" rx="220" ry="80" />
          <ellipse cx="1360" cy="370" rx="140" ry="54" />
          <ellipse cx="1180" cy="580" rx="140" ry="40" />
        </g>
        <g filter={`url(#${p}-mist)`} fill="#3b3631" opacity={0.26}>
          <ellipse cx="790" cy="950" rx="140" ry="50" />
        </g>
        {a.woods.map((w, i) => (
          <path key={i} d={w.d} fill={w.base} opacity={0.55} filter={`url(#${p}-wash)`} />
        ))}
      </>
    );
  }
  if (art.id === 'razdolye') {
    const a = art.art;
    return (
      <>
        <g clipPath={`url(#${p}-in)`}>
          <path d={a.land} fill="none" stroke="#5b4630" strokeWidth={30} opacity={0.26} filter={`url(#${p}-glow)`} />
        </g>
        <g filter={`url(#${p}-mist)`} fill="#5e3f7a" opacity={0.32}>
          <ellipse cx={a.twilight.x} cy={a.twilight.y} rx="120" ry="56" />
        </g>
        {a.woods.map((w, i) => (
          <path key={i} d={w.d} fill={w.base} opacity={0.5} filter={`url(#${p}-wash)`} />
        ))}
      </>
    );
  }
  const a = art.art;
  return <path d={a.storm} fill="none" stroke="#c050c6" strokeWidth={26} opacity={0.28} filter={`url(#${p}-glow)`} />;
});

/** Чёткие слои рельефа (без фильтров): реки, деревья, горы, штрихи, стена — остаются векторными и чёткими вблизи. */
export const ArtCrisp = memo(function ArtCrisp({ art, p }: { art: Art; p: string }) {
  if (art.id === 'world') {
    const a = art.art;
    return (
      <>
        <Rivers list={a.rivers} />
        <Strokes list={a.fields} stroke="#7a6346" width={0.8} opacity={0.35} />
        <Strokes list={a.dunes} stroke="#8a6e2a" width={1} opacity={0.45} />
        <Strokes list={a.ice} stroke="#7f93ab" width={0.9} opacity={0.55} />
        {a.hills.map((h, i) => (
          <path key={i} d={h.d} fill="none" stroke={h.c} strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
        ))}
        <Strokes list={a.tufts} stroke="#5d2b3a" width={1.1} opacity={0.65} cap />
        <Strokes list={a.cracks} stroke="#6b5420" width={1} opacity={0.5} />
        <Trees list={a.trees} />
        <Mountains list={a.mounts} />
        {a.volcs.map((v, i) => (
          <g key={i} transform={`translate(${v.x} ${v.y}) scale(${v.s})`}>
            <path d="M-22 0 C-12 -8 -8 -18 -5 -24 L5 -24 C8 -18 12 -8 22 0Z" fill="#8a7f75" stroke="#2d2622" strokeWidth={1.1} />
            <path d="M5 -24 C8 -18 12 -8 22 0 L4 0 C5 -9 5 -17 5 -24Z" fill="#6b625a" />
            <path d="M-5 -24 L5 -24 L2 -18 L-2 -19Z" fill="#d0603f" />
            <path d="M0 -28 q-9 -10 2 -19 q10 -8 2 -19" fill="none" stroke="#6b625a" strokeWidth={3} strokeLinecap="round" opacity={0.45} />
          </g>
        ))}
      </>
    );
  }
  if (art.id === 'razdolye') {
    const a = art.art;
    return (
      <>
        <g mask={`url(#${p}-out)`}>
          <Trees list={a.nTrees} opacity={0.7} ink="#3b4a2a" />
          <Mountains list={a.nMounts} light="#f1f4f7" shade="#a6b3c3" opacity={0.75} />
        </g>
        <g clipPath={`url(#${p}-in)`}>
          <Strokes list={a.fields} stroke="#7a6346" width={0.8} opacity={0.35} />
          <Strokes list={a.hills} stroke="#6b5a3c" width={1.2} opacity={0.55} cap />
        </g>
        <path d={a.land} fill="none" stroke="#f5eedb" strokeWidth={5} opacity={0.75} />
        <path d={a.land} fill="none" stroke="#4a3a26" strokeWidth={1.8} strokeDasharray="9 3 1.5 3" strokeLinecap="round" />
        <Rivers list={a.rivers} />
        <Trees list={a.trees} />
        <Mountains list={a.mounts} light="#efe6cc" shade="#b7a37a" />
      </>
    );
  }
  const a = art.art;
  return (
    <>
      <path d={a.nLine} fill="none" stroke="#f5eedb" strokeWidth={5} opacity={0.75} />
      <path d={a.sLine} fill="none" stroke="#f5eedb" strokeWidth={5} opacity={0.75} />
      <path d={a.nLine} fill="none" stroke="#4a3a26" strokeWidth={1.7} strokeDasharray="9 3 1.5 3" />
      <path d={a.sLine} fill="none" stroke="#4a3a26" strokeWidth={1.7} strokeDasharray="9 3 1.5 3" />
      <Strokes list={a.ice} stroke="#7f93ab" width={0.9} opacity={0.55} />
      <Strokes list={a.drifts} stroke="#9fb0c2" width={1.2} opacity={0.7} cap />
      <Strokes list={a.dunes} stroke="#8a6e2a" width={1} opacity={0.45} />
      <path d={a.storm} fill="none" stroke="#a03aa6" strokeWidth={2.4} strokeDasharray="2 6" strokeLinecap="round" />
      <circle cx={a.eye.x} cy={a.eye.y} r={96} fill={`url(#${p}-eye)`} />
      <g fill="none" stroke="#6a1f70" strokeWidth={1.6} strokeLinecap="round" opacity={0.75}>
        {a.vortex.map((v, i) => (
          <path key={i} d={v} />
        ))}
      </g>
      <path d={a.lake} fill={`url(#${p}-lake)`} stroke="#4f8aa3" strokeWidth={2} />
      <path d={a.lake} fill="none" stroke="#ffffff" strokeWidth={6} opacity={0.35} transform="translate(-3 -3)" />
      <path d={a.ripples} fill="none" stroke="#ffffff" strokeWidth={1.2} opacity={0.7} />
      {a.pines.map((t, i) => (
        <path key={i} d={t.d} fill={t.fill} stroke="#1f3328" strokeWidth={0.6} />
      ))}
      <Mountains list={a.mounts} light="#f4f7fa" shade="#a3b0c1" ink="#344052" />
      <path id={`${p}-wallpath`} d={a.wall} fill="none" stroke="#2e2416" strokeWidth={9} strokeLinecap="round" />
      <path d={a.wall} fill="none" stroke="#b9a983" strokeWidth={4.5} strokeLinecap="round" />
      {a.merlons.map((m, i) => (
        <rect key={i} x={-3.5} y={-9} width={7} height={7} transform={`translate(${m.x} ${m.y}) rotate(${m.a})`} fill="#2e2416" />
      ))}
      <g
        style={{ fontFamily: "'Cormorant SC', Georgia, serif", fontWeight: 700 }}
        fontSize={22}
        letterSpacing={8}
        fill="#2e2416"
        stroke="#f3ecd9"
        strokeWidth={4.5}
        paintOrder="stroke"
      >
        <text dy={-14}>
          <textPath href={`#${p}-wallpath`} startOffset="34%" textAnchor="middle">
            ЗАСТАВА
          </textPath>
        </text>
      </g>
    </>
  );
});

/** Край бумаги и зерно (мягкое, можно запечь). На карте мира — дымка по краям. */
export const ArtPaperFx = memo(function ArtPaperFx({ art, p }: { art: Art; p: string }) {
  return (
    <>
      <rect width="1600" height="1100" fill={`url(#${p}-edge)`} pointerEvents="none" />
      {art.id === 'world' && (
        <g filter={`url(#${p}-mist)`} fill="#f3ecd9" opacity={0.75}>
          <ellipse cx="60" cy="300" rx="120" ry="200" />
          <ellipse cx="1560" cy="760" rx="110" ry="220" />
          <ellipse cx="800" cy="1090" rx="380" ry="60" />
          <ellipse cx="1000" cy="10" rx="360" ry="50" />
        </g>
      )}
      <rect width="1600" height="1100" filter={`url(#${p}-grain)`} pointerEvents="none" />
    </>
  );
});

/** Надписи бумаги (шрифт карты — только в живом SVG: в запечённой картинке внешние шрифты не грузятся). */
export const ArtPaperText = memo(function ArtPaperText({ art }: { art: Art }) {
  if (art.id !== 'world') return null;
  return (
    <g style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: 'italic' }} fontSize={22} fill="#6b5a40" letterSpacing={8} opacity={0.75}>
      <text x="44" y="560" transform="rotate(-90 44 560)" textAnchor="middle">
        неизведанные земли
      </text>
      <text x="1562" y="420" transform="rotate(90 1562 420)" textAnchor="middle">
        неизведанные земли
      </text>
      <text x="800" y="1084" textAnchor="middle">
        неизведанные земли
      </text>
      <text x="1060" y="34" textAnchor="middle">
        неизведанные земли
      </text>
    </g>
  );
});

/** Дополнительные определения рельефа конкретной карты (маски берега, градиенты озера и бури). */
export const ArtDefs = memo(function ArtDefs({ art, p }: { art: Art; p: string }) {
  if (art.id === 'razdolye')
    return (
      <>
        <clipPath id={`${p}-in`}>
          <path d={art.art.land} />
        </clipPath>
        <mask id={`${p}-out`}>
          <rect width="1600" height="1100" fill="white" />
          <path d={art.art.land} fill="black" />
        </mask>
      </>
    );
  if (art.id === 'frozen')
    return (
      <>
        <radialGradient id={`${p}-lake`} cx="45%" cy="40%" r="60%">
          <stop offset="0" stopColor="#d9eef4" />
          <stop offset="1" stopColor="#8fbfd2" />
        </radialGradient>
        <radialGradient id={`${p}-eye`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#f0a0ea" stopOpacity={0.95} />
          <stop offset=".45" stopColor="#c050c6" stopOpacity={0.55} />
          <stop offset="1" stopColor="#9a3aa0" stopOpacity={0} />
        </radialGradient>
      </>
    );
  return null;
});
