import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { EFFECT_LABELS, type Figure, type TableNpc } from '@zg/shared';
import { onLiveRoll, type FeedRoll } from '../lib/feed.ts';
import { capabilities } from '../lib/capabilities.ts';
import { simulateThrow, warmPhysics } from '../dice/physics.ts';
import type { StageRoll } from '../dice/DiceStage.tsx';
import type { DieColors } from '../dice/mesh.ts';
import { cn } from '../lib/cn.ts';
import { effectColor } from './palette.ts';

const DiceStage = lazy(() => import('../dice/DiceStage.tsx'));
// Бой фигурок (этап 25) — свой чанк: каталог деталей и сборка листов нужны, только когда есть кого показать.
const TvBattle = lazy(() => import('./TvBattle.tsx').then((m) => ({ default: m.TvBattle })));
const loadBattle = () => import('./TvBattle.tsx');

/** Грани кубика на столе — цвета макета, не темы. */
const TV_DIE: DieColors = { body: '#2f8f63', ink: '#0b140e', edge: 'rgba(0,0,0,.3)', font: "'IBM Plex Mono', ui-monospace, monospace" };
const PLATE_MS = 2200;
const GAP_MS = 700;

type Phase = { roll: FeedRoll; step: 'rolling' | 'battle' | 'plate'; battle?: Battle } | null;
type Battle = { hero: Figure; foe: Figure; foeName: string };

/**
 * Бой вместо кубика: публичный бросок игрока с фигуркой, на столе показан противник сессии с фигуркой,
 * исход — удар (не бросок удачи). Мастер раскрывает противника столу сам — кнопкой «Показать на столе».
 */
async function battleFor(r: FeedRoll, npc: TableNpc | null): Promise<Battle | null> {
  if ('memberId' in r || !r.figure || !npc?.opponent || !npc.figure) return null;
  const { battleOutcome } = await loadBattle();
  return battleOutcome(r.effect) ? { hero: r.figure, foe: npc.figure, foeName: npc.name } : null;
}

/**
 * Большой бросок на столе: публичные броски вживую (filter — тот же, что у колонки), по одному.
 * Кубик катится над сценой (0,75 скорости, до 2,5 с), после посадки — плашка с числом и исходом, затем число
 * перелетает в колонку (layoutId `tv-roll-<id>`). Пока бросок идёт, onFlying сообщает его id: колонка прячет у этой
 * строки число. Без 3D (облегчённый режим, «Анимация выкл.», нет WebGL2) — сразу плашка.
 * Если идёт бой (battleFor) — вместо кубика сцена боя фигурок; в облегчённом режиме и с «Анимация выкл.» её нет.
 */
export function TvBigRoll({
  filter,
  three,
  npc,
  onFlying,
}: {
  filter: (r: FeedRoll) => boolean;
  /** можно двигаться: не облегчённый режим и не «Анимация выкл.» */
  three: boolean;
  /** противник на столе — для боя */
  npc: TableNpc | null;
  onFlying: (id: string | null) => void;
}) {
  const can3d = three && capabilities.webgl2();
  const npcRef = useRef(npc);
  npcRef.current = npc;
  // фигурки противника — заранее, пока никто не бросил
  useEffect(() => {
    if (three && npc?.opponent && npc.figure) void loadBattle();
  }, [three, npc?.opponent, npc?.figure]);
  const queue = useRef<FeedRoll[]>([]);
  const busy = useRef(false);
  const [phase, setPhase] = useState<Phase>(null);
  const [stage, setStage] = useState<StageRoll>({ key: '', kind: 'd20', traj: null, value: null });
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    if (can3d) warmPhysics();
  }, [can3d]);

  // Текущий бросок и «уже лёг»: onLanded и onLost могут прийти оба, плашка — одна.
  const current = useRef<{ roll: FeedRoll; landed: boolean } | null>(null);
  const finish = (r: FeedRoll) => {
    if (current.current?.roll.id !== r.id || current.current.landed) return;
    current.current.landed = true;
    setPhase((p) => (p?.roll.id === r.id ? { ...p, step: 'plate' } : p));
    later(() => {
      // одним обновлением: плашка уходит, число в колонке появляется — Motion переносит его по layoutId
      setPhase(null);
      onFlying(null);
      setStage((s) => ({ ...s, key: '' }));
      later(next, GAP_MS);
    }, PLATE_MS);
  };

  const next = async () => {
    const r = queue.current.shift();
    if (!r) {
      busy.current = false;
      return;
    }
    busy.current = true;
    current.current = { roll: r, landed: false };
    onFlying(r.id);
    const battle = three ? await battleFor(r, npcRef.current).catch(() => null) : null;
    if (battle) {
      // сцена сама зовёт finish по окончании (и у неё своя страховка по времени)
      setPhase({ roll: r, step: 'battle', battle });
      return;
    }
    setPhase({ roll: r, step: 'rolling' });
    if (!can3d) return finish(r);
    setStage({ key: r.id, kind: r.kind, traj: null, value: r.value });
    const traj = await Promise.race([simulateThrow(r.kind), new Promise<null>((ok) => window.setTimeout(() => ok(null), 900))]);
    if (traj) {
      setStage((s) => (s.key === r.id ? { ...s, traj } : s));
      later(() => finish(r), 6000); // страховка: кадры не идут (вкладка скрыта) — очередь не встаёт
    } else finish(r);
  };

  useEffect(
    () =>
      onLiveRoll((r) => {
        if (!filter(r)) return;
        queue.current = [...queue.current, r].slice(-3);
        if (!busy.current) void next();
      }),
    [can3d, three], // next и filter читают только ref и стабильные функции
  );

  const rolling = phase?.step === 'rolling' && !!stage.key;
  const battle = phase?.battle;
  // место плашки — по последнему броску: уходящая плашка не прыгает, когда фаза уже сброшена
  const lastBattle = useRef(false);
  if (phase) lastBattle.current = !!battle;
  return (
    <>
      <AnimatePresence>
        {battle && phase && (
          <Suspense key={phase.roll.id} fallback={null}>
            <TvBattle
              hero={battle.hero}
              heroName={phase.roll.character ?? phase.roll.who}
              foe={battle.foe}
              foeName={battle.foeName}
              effect={phase.roll.effect}
              value={phase.roll.value}
              onDone={() => finish(phase.roll)}
            />
          </Suspense>
        )}
      </AnimatePresence>
      {can3d && (
        <div
          aria-hidden="true"
          className={cn('pointer-events-none absolute inset-0 transition-opacity duration-500', rolling || (phase?.step === 'plate' && !battle) ? 'opacity-100' : 'opacity-0')}
        >
          <Suspense fallback={null}>
            <DiceStage
              className="!absolute inset-0"
              roll={stage}
              floor
              colors={TV_DIE}
              budget={2.5}
              minSpeed={0.75}
              onLanded={() => current.current && finish(current.current.roll)}
              onLost={() => current.current && finish(current.current.roll)}
            />
          </Suspense>
        </div>
      )}
      <div className={cn('pointer-events-none absolute inset-x-0 flex justify-center', lastBattle.current ? 'top-[79%]' : 'top-[66%]')} aria-live="polite">
        <AnimatePresence>
          {phase?.step === 'plate' && (
            <m.div
              key={phase.roll.id}
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              className="flex items-baseline gap-[1.4vw] rounded-full border border-solid border-[var(--tv-line)] bg-[rgba(13,15,13,.82)] px-[2.2vw] py-[1.2vh]"
            >
              <m.b layoutId={`tv-roll-${phase.roll.id}`} className="font-['IBM_Plex_Mono',monospace] text-[clamp(48px,3.8vw,80px)] leading-none font-medium tabular-nums">
                {phase.roll.value}
              </m.b>
              <span className={cn('text-[clamp(24px,1.9vw,40px)] font-semibold', effectColor(phase.roll.effect))}>{EFFECT_LABELS[phase.roll.effect]}</span>
              <span className="text-[clamp(18px,1.45vw,30px)] text-[var(--tv-muted)]">
                {phase.roll.character ?? phase.roll.who} · {phase.roll.kind}
              </span>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
