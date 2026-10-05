import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { EFFECT_LABELS } from '@zg/shared';
import { onLiveRoll, type FeedRoll } from '../lib/feed.ts';
import { capabilities } from '../lib/capabilities.ts';
import { simulateThrow, warmPhysics } from '../dice/physics.ts';
import type { StageRoll } from '../dice/DiceStage.tsx';
import type { DieColors } from '../dice/mesh.ts';
import { cn } from '../lib/cn.ts';
import { effectColor } from './palette.ts';

const DiceStage = lazy(() => import('../dice/DiceStage.tsx'));

/** Грани кубика на столе — цвета макета, не темы. */
const TV_DIE: DieColors = { body: '#2f8f63', ink: '#0b140e', edge: 'rgba(0,0,0,.3)', font: "'IBM Plex Mono', ui-monospace, monospace" };
const PLATE_MS = 2200;
const GAP_MS = 700;

type Phase = { roll: FeedRoll; step: 'rolling' | 'plate' } | null;

/**
 * Большой бросок на столе: публичные броски вживую (filter — тот же, что у колонки), по одному.
 * Кубик катится над сценой (0,75 скорости, до 2,5 с), после посадки — плашка с числом и исходом, затем число
 * перелетает в колонку (layoutId `tv-roll-<id>`). Пока бросок идёт, onFlying сообщает его id: колонка прячет у этой
 * строки число. Без 3D (облегчённый режим, «Анимация выкл.», нет WebGL2) — сразу плашка.
 */
export function TvBigRoll({ filter, three, onFlying }: { filter: (r: FeedRoll) => boolean; three: boolean; onFlying: (id: string | null) => void }) {
  const can3d = three && capabilities.webgl2();
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
    setPhase((p) => (p?.roll.id === r.id ? { roll: r, step: 'plate' } : p));
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
    [can3d], // next и filter читают только ref и стабильные функции
  );

  const rolling = phase?.step === 'rolling' && !!stage.key;
  return (
    <>
      {can3d && (
        <div
          aria-hidden="true"
          className={cn('pointer-events-none absolute inset-0 transition-opacity duration-500', rolling || phase?.step === 'plate' ? 'opacity-100' : 'opacity-0')}
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
      <div className="pointer-events-none absolute inset-x-0 top-[66%] flex justify-center" aria-live="polite">
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
