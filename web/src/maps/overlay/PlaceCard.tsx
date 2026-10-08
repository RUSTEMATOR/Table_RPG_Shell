import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PLACE_KIND_LABELS, RUMOR_KIND_LABELS, SPOT_KIND_LABELS, type CitySection, type PlaceDetailPublic, type PresencePublic } from '@zg/shared';
import { api } from '../../lib/api.ts';
import { useSocketEvent } from '../../lib/socket.ts';
import { useActivity } from '../../lib/activity.ts';
import { cn } from '../../lib/cn.ts';
import { FigureSprite } from '../../figure/FigureSprite.tsx';
import { PlaceIcon } from '../MapView.tsx';
import { teamOf } from '../../maps3d/settlements.ts';
import { GameIcon, RUMOR_ICON, SPOT_ICON, type GameIconName } from '../../ui/GameIcon.tsx';
import { Pic } from '../../components/Pic.tsx';

// Карточка места и экран города (этап 27) — у игрока и на столе. Данные — только открытое (projectPlaceDetail на сервере):
// описание, правитель, фракция, население, места в городе, открытые слухи и задания, «кто здесь».
// Экран города — как в Mount & Blade: меню мест слева, описание выбранного и кто там; фон — картинка мастера или
// сам город в 3D (камера кружит над ним).

const TEAM_COLOR = { blue: '#3b5f9a', red: '#9a3b2f', yellow: '#b08a1e', green: '#3f7a3f' } as const;
const SERIF = "'Cormorant Garamond', Georgia, serif";

/** Карточка места: перечитывается по сигналу; null — нет или скрыто (тогда карточка закрывается). */
export function usePlaceDetail(base: '/api/player/maps/places' | '/api/table/maps/places', id: string | null, refresh?: string) {
  const [d, setD] = useState<PlaceDetailPublic | null>(null);
  const [gone, setGone] = useState(false);
  const reload = useCallback(async () => {
    if (!id) return;
    const r = await api<PlaceDetailPublic>('GET', `${base}/${id}`);
    if (r.ok) {
      setD(r.data);
      setGone(false);
    } else if (r.status === 404) setGone(true);
  }, [base, id]);
  useEffect(() => {
    setD(null);
    setGone(false);
    void reload();
  }, [reload]);
  // отряд переместился — можно ли войти, решает сервер заново
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void reload();
  }, [refresh]);
  useSocketEvent('map:place.changed', (e) => e.placeId === id && void reload());
  return { d, gone };
}

/** Куда можно войти (у озера, бури и отметки «внутри» нет). */
const ENTERABLE = (k: PlaceDetailPublic['kind']) => k !== 'lake' && k !== 'storm' && k !== 'mark';
const hasCity = (d: PlaceDetailPublic) => d.spots.length > 0 || d.rumors.length > 0 || d.here.length > 0;

function Banner({ d, big }: { d: PlaceDetailPublic; big?: boolean }) {
  const team = TEAM_COLOR[teamOf(d.ink, d.kind)];
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn('grid shrink-0 place-items-center rounded-[8px] border-2 border-solid border-[rgba(243,236,217,.6)]', big ? 'size-[7vh]' : 'size-12')}
        style={{ background: team }}
      >
        <svg viewBox="-17 -17 34 34" className={big ? 'size-[4.6vh]' : 'size-8'} aria-hidden="true">
          <PlaceIcon kind={d.kind} ink="#f3ecd9" />
        </svg>
      </span>
      <div className="grid min-w-0">
        <h2 className={cn('m-0 truncate leading-none font-bold', big ? 'text-[clamp(36px,4.6vh,72px)]' : 'text-[26px]')} style={{ fontFamily: SERIF }}>
          {d.name || PLACE_KIND_LABELS[d.kind]}
        </h2>
        <span className={cn('opacity-75', big ? 'text-[clamp(16px,2vh,30px)]' : 'text-[13.6px]')}>
          {PLACE_KIND_LABELS[d.kind]}
          {d.subtitle ? ` · ${d.subtitle}` : ''}
        </span>
      </div>
    </div>
  );
}

function Facts({ d, big }: { d: PlaceDetailPublic; big?: boolean }) {
  const list = [
    ['Правитель', d.ruler],
    ['Фракция', d.faction],
    ['Население', d.population],
  ].filter(([, v]) => v);
  if (!list.length) return null;
  return (
    <dl className={cn('m-0 grid gap-x-4 gap-y-0.5', big ? 'grid-cols-[auto_1fr] text-[clamp(16px,2.1vh,32px)]' : 'grid-cols-[auto_1fr] text-[14px]')}>
      {list.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="opacity-65">{k}</dt>
          <dd className="m-0 font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Карточка места поверх карты: на телефоне — снизу, на широком экране — справа. */
export function PlaceCard({
  id,
  refresh,
  onClose,
  onEnter,
  extra,
}: {
  id: string;
  /** меняется, когда отряд переместился */
  refresh?: string;
  onClose: () => void;
  onEnter: () => void;
  /** дополнительная строка (путь и дни — этап 28) */
  extra?: (d: PlaceDetailPublic) => ReactNode;
}) {
  const { d, gone } = usePlaceDetail('/api/player/maps/places', id, refresh);
  useEffect(() => {
    if (gone) onClose();
  }, [gone]); // onClose — колбэк экрана
  return (
    <div
      className="absolute inset-x-2 bottom-2 z-[2] grid max-h-[62%] gap-3 overflow-y-auto overscroll-contain rounded-[14px] border border-solid border-[rgba(243,236,217,.25)] bg-[rgba(32,26,18,.92)] p-4 text-[#f3ecd9] shadow-[0_14px_40px_rgba(10,8,4,.45)] backdrop-blur-sm sm:top-[max(12px,env(safe-area-inset-top))] sm:right-[max(12px,env(safe-area-inset-right))] sm:bottom-auto sm:left-auto sm:max-h-[calc(100%-24px)] sm:w-[360px]"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Место на карте"
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute top-2 right-2 grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-[rgba(243,236,217,.12)] text-[18px] text-[#f3ecd9]"
      >
        ×
      </button>
      {!d ? (
        <span className="opacity-70">Загрузка…</span>
      ) : (
        <>
          <Banner d={d} />
          <Facts d={d} />
          <p className="m-0 text-[15px] leading-relaxed whitespace-pre-line opacity-90" style={{ fontFamily: SERIF, fontSize: 17 }}>
            {d.description || 'Об этом месте пока ничего не известно.'}
          </p>
          {extra?.(d)}
          {!d.inside && ENTERABLE(d.kind) && (
            <div className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-[rgba(243,236,217,.3)] px-3 py-2.5 text-[14px] opacity-85">
              <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <rect x={5} y={11} width={14} height={10} rx={2} />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              <span>Войти можно, когда отряд будет рядом.</span>
            </div>
          )}
          {d.inside && hasCity(d) && (
            <button
              type="button"
              onClick={onEnter}
              className="cursor-pointer rounded-[10px] border border-solid border-[#c9971f] bg-[#c9971f] px-4 py-2.5 font-ui text-[15px] font-bold text-[#201a12] hover:bg-[#ddb04a]"
            >
              Войти в {d.kind === 'village' ? 'деревню' : d.kind === 'camp' || d.kind === 'vampire' ? 'лагерь' : 'город'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Here({ list, big }: { list: PresencePublic[]; big?: boolean }) {
  if (!list.length) return null;
  return (
    <ul className={cn('m-0 grid list-none gap-2 p-0', big && 'gap-[1.2vh]')}>
      {list.map((h) => (
        <li key={h.id} className="flex items-center gap-3">
          <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full bg-[rgba(243,236,217,.12)]', big ? 'size-[8vh]' : 'size-14')}>
            {h.figure ? (
              <FigureSprite figure={h.figure} size={big ? 96 : 64} className="pointer-events-none" />
            ) : (
              <span className="font-ui text-[22px] font-bold">{(h.name.trim()[0] ?? '?').toUpperCase()}</span>
            )}
          </span>
          <span className="grid">
            <strong className={cn('font-ui', big && 'text-[clamp(18px,2.4vh,36px)]')}>{h.name}</strong>
            {h.label && <span className={cn('opacity-75', big ? 'text-[clamp(15px,1.9vh,28px)]' : 'text-[13.6px]')}>{h.label}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

type Section = { key: string; title: string; kind?: string; icon?: GameIconName };

/**
 * Экран города: меню слева (обзор, места в городе, слухи, кто здесь), справа — выбранное. table — крупно и без нажатий
 * (на столе показывает мастер). Фон — картинка мастера; без неё экран полупрозрачный, за ним — город в 3D.
 */
export function CityScreen({ d, onClose, table }: { d: PlaceDetailPublic; onClose?: () => void; table?: boolean }) {
  const sections: Section[] = [
    { key: 'about', title: 'Обзор' },
    ...d.spots.map((s) => ({ key: `spot:${s.id}`, title: s.name || SPOT_KIND_LABELS[s.kind], kind: SPOT_KIND_LABELS[s.kind], icon: SPOT_ICON[s.kind] })),
    ...(d.rumors.length ? [{ key: 'rumors', title: 'Слухи и задания', icon: RUMOR_ICON.rumor }] : []),
    ...(d.here.length ? [{ key: 'here', title: 'Кто здесь' }] : []),
  ];
  const [sel, setSel] = useState('about');
  const section: CitySection = sel.startsWith('spot:') ? 'spot' : sel === 'rumors' || sel === 'here' ? sel : 'about';
  useActivity('map', table ? null : { kind: 'map.city', placeId: d.id, section });
  useEffect(() => {
    if (!sections.some((s) => s.key === sel)) setSel('about');
  }, [d]); // sections — из d
  useEffect(() => {
    if (!onClose) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const spot = sel.startsWith('spot:') ? d.spots.find((s) => `spot:${s.id}` === sel) : null;
  const big = !!table;

  // на столе — всё сразу, без меню
  if (table)
    return (
      <div className="absolute inset-0 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-[4vw] overflow-hidden p-[6vh_5vw] text-[#f3ecd9]">
        <Backdrop d={d} />
        <div className="relative grid content-start gap-[2.4vh]">
          <Banner d={d} big />
          <Facts d={d} big />
          {d.description && (
            <p className="m-0 text-[clamp(20px,2.5vh,40px)] leading-snug whitespace-pre-line" style={{ fontFamily: SERIF }}>
              {d.description}
            </p>
          )}
          <Here list={[...d.here, ...d.spots.flatMap((s) => s.here)]} big />
        </div>
        <div className="relative grid content-start gap-[2vh]">
          {d.spots.map((s) => (
            <div key={s.id} className="grid gap-[0.4vh] rounded-[1vh] bg-[rgba(20,16,10,.55)] p-[1.6vh_1.4vw]">
              <span className="flex items-center gap-[0.5vw] text-[clamp(13px,1.6vh,24px)] tracking-[.08em] uppercase opacity-70">
                <GameIcon name={SPOT_ICON[s.kind]} className="size-[1.4em]" />
                {SPOT_KIND_LABELS[s.kind]}
              </span>
              <strong className="text-[clamp(22px,2.8vh,44px)] leading-none" style={{ fontFamily: SERIF }}>
                {s.name || SPOT_KIND_LABELS[s.kind]}
              </strong>
              {s.description && <span className="text-[clamp(16px,2vh,30px)] opacity-90">{s.description}</span>}
            </div>
          ))}
          {d.rumors.length > 0 && (
            <div className="grid gap-[1vh] rounded-[1vh] bg-[rgba(20,16,10,.55)] p-[1.6vh_1.4vw]">
              <span className="text-[clamp(13px,1.6vh,24px)] tracking-[.08em] uppercase opacity-70">Слухи и задания</span>
              {d.rumors.map((r) => (
                <span key={r.id} className="text-[clamp(16px,2vh,30px)]">
                  <b className={r.kind === 'quest' ? 'text-[#e8c25a]' : undefined}>
                    <GameIcon name={RUMOR_ICON[r.kind]} className="mr-[0.3em]" />
                    {RUMOR_KIND_LABELS[r.kind]}.
                  </b>{' '}
                  {r.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );

  return (
    <div
      className="absolute inset-0 z-[3] grid grid-rows-[auto_minmax(0,1fr)] gap-3 p-3 pt-[max(12px,env(safe-area-inset-top))] pr-[max(12px,env(safe-area-inset-right))] text-[#f3ecd9] sm:grid-cols-[230px_minmax(0,1fr)] sm:grid-rows-1 sm:p-4 sm:pt-[max(16px,env(safe-area-inset-top))] sm:pr-[max(16px,env(safe-area-inset-right))]"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`Город: ${d.name}`}
    >
      <Backdrop d={d} />
      <nav aria-label="Меню города" className="relative grid content-start gap-1.5 rounded-[14px] bg-[rgba(32,26,18,.86)] p-3 backdrop-blur-sm">
        <Banner d={d} />
        <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1 sm:grid sm:overflow-visible sm:pb-0">
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-current={sel === s.key}
              onClick={() => setSel(s.key)}
              className={cn(
                'flex shrink-0 cursor-pointer items-center gap-2.5 rounded-[9px] border border-solid px-3 py-1.5 text-left font-ui text-[15px] whitespace-nowrap',
                sel === s.key ? 'border-[#c9971f] bg-[rgba(201,151,31,.22)]' : 'border-transparent bg-[rgba(243,236,217,.06)] hover:bg-[rgba(243,236,217,.12)]',
              )}
            >
              {s.icon && <GameIcon name={s.icon} className="size-5 opacity-80" />}
              <span className="grid gap-0">
                <span className="font-semibold">{s.title}</span>
                {s.kind && s.kind !== s.title && <span className="text-[11.5px] opacity-65">{s.kind}</span>}
              </span>
            </button>
          ))}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-1 hidden cursor-pointer rounded-[9px] border border-solid border-[rgba(243,236,217,.3)] bg-transparent px-3 py-2 font-ui text-[14px] text-[#f3ecd9] sm:block"
          >
            Покинуть город
          </button>
        )}
      </nav>
      <section className="relative grid content-start gap-3 overflow-y-auto overscroll-contain rounded-[14px] bg-[rgba(32,26,18,.86)] p-4 backdrop-blur-sm">
        {onClose && (
          <button
            type="button"
            aria-label="Покинуть город"
            onClick={onClose}
            className="absolute top-2 right-2 grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-[rgba(243,236,217,.12)] text-[18px] text-[#f3ecd9] sm:hidden"
          >
            ×
          </button>
        )}
        {sel === 'about' && (
          <>
            <Facts d={d} />
            <p className="m-0 leading-relaxed whitespace-pre-line" style={{ fontFamily: SERIF, fontSize: 18 }}>
              {d.description || 'Об этом месте пока ничего не известно.'}
            </p>
            <Here list={d.here} />
          </>
        )}
        {spot && (
          <>
            <span className="flex items-center gap-1.5 text-[12px] tracking-[.08em] uppercase opacity-65">
              <GameIcon name={SPOT_ICON[spot.kind]} className="size-4" />
              {SPOT_KIND_LABELS[spot.kind]}
            </span>
            <h3 className="m-0 text-[26px] leading-none" style={{ fontFamily: SERIF }}>
              {spot.name || SPOT_KIND_LABELS[spot.kind]}
            </h3>
            <p className="m-0 leading-relaxed whitespace-pre-line" style={{ fontFamily: SERIF, fontSize: 18 }}>
              {spot.description || 'Ничего примечательного.'}
            </p>
            <Here list={spot.here} />
          </>
        )}
        {sel === 'rumors' && (
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {d.rumors.map((r) => (
              <li key={r.id} className="grid gap-0.5 border-l-[3px] border-solid pl-3" style={{ borderColor: r.kind === 'quest' ? '#e8c25a' : 'rgba(243,236,217,.35)' }}>
                <span className="flex items-center gap-1.5 text-[12px] tracking-[.08em] uppercase opacity-65">
                  <GameIcon name={RUMOR_ICON[r.kind]} className="size-4" />
                  {RUMOR_KIND_LABELS[r.kind]}
                </span>
                <span style={{ fontFamily: SERIF, fontSize: 18 }}>{r.text}</span>
              </li>
            ))}
          </ul>
        )}
        {sel === 'here' && <Here list={[...d.here, ...d.spots.flatMap((s) => s.here)]} />}
      </section>
    </div>
  );
}

/** Фон экрана города: картинка мастера с затемнением; без неё — лёгкое затемнение (за ним виден город). */
function Backdrop({ d }: { d: PlaceDetailPublic }) {
  return d.image ? (
    <div aria-hidden="true" className="absolute inset-0 -z-0">
      <Pic image={d.image} className="absolute inset-0" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(14,11,7,.75),rgba(14,11,7,.25)_60%,rgba(14,11,7,.55))]" />
    </div>
  ) : (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(14,11,7,.55),rgba(14,11,7,0)_55%)]" />
  );
}
