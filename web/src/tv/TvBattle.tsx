import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { Effect, Figure } from '@zg/shared';
import { FigureSprite, type Pose } from '../figure/FigureSprite.tsx';
import { attackOf, preloadFigure } from '../figure/compose.ts';
import { cn } from '../lib/cn.ts';
import { play } from './sound.ts';

// Бой на столе (этап 25, макет «Стол · Бой»): публичный бросок игрока против противника сессии, показанного на столе.
// Фигурка игрока выходит слева и бьёт своим оружием; противник справа отвечает по исходу броска с сервера:
// крит — вспышка и отлёт, успех — вздрагивает, «лишь царапина» — удар без вреда, провал — промах и ответный удар.
// Сцена только показывает исход — ничего не решает. После неё TvBigRoll показывает плашку с числом.

export type Outcome = 'crit' | 'hit' | 'scratch' | 'miss';
const OUTCOME: Partial<Record<Effect, Outcome>> = {
  crit: 'crit',
  crit_damage: 'crit',
  strong: 'hit',
  success: 'hit',
  notable_damage: 'hit',
  scratch: 'scratch',
  fail: 'miss',
  complication: 'miss',
};
/** Исход для сцены; null — бросок не про удар (бросок удачи), сцены нет. */
export const battleOutcome = (e: Effect): Outcome | null => OUTCOME[e] ?? null;

const NUM_COLOR: Record<Outcome, string> = { crit: '#8ef0b0', hit: '#8ef0b0', scratch: '#f0c46f', miss: '#ff8b8b' };
const ranged = (f: Figure) => {
  const a = attackOf(f);
  return a === 'shoot' || a === 'spellcast';
};

type Step = 'load' | 'enter' | 'approach' | 'attack' | 'impact' | 'counter' | 'hold';
const ME_X = 30; // % ширины — центр фигурки
const FOE_X = 68;
const MELEE_GAP = 13;

export function TvBattle({
  hero,
  heroName,
  foe,
  foeName,
  effect,
  value,
  onDone,
}: {
  hero: Figure;
  heroName: string;
  foe: Figure;
  foeName: string;
  effect: Effect;
  value: number;
  onDone: () => void;
}) {
  const outcome = battleOutcome(effect) ?? 'scratch';
  const [step, setStep] = useState<Step>('load');
  const done = useRef(onDone);
  done.current = onDone;
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Сначала — листы обеих фигурок (не дольше 1,5 с: без сети сцена идёт с тем, что есть).
  useEffect(() => {
    let alive = true;
    const ready = Promise.all([preloadFigure(hero, ['idle', 'walk', attackOf(hero), 'hurt']), preloadFigure(foe, ['idle', 'walk', attackOf(foe), 'hurt'])]);
    void Promise.race([ready, new Promise((ok) => window.setTimeout(ok, 1500))]).then(() => {
      if (!alive) return;
      setStep('enter');
      later(() => setStep(ranged(hero) ? 'attack' : 'approach'), 850);
    });
    // страховка: что бы ни случилось с кадрами (вкладка скрыта), очередь бросков не встаёт
    const guard = window.setTimeout(() => done.current(), 9000);
    return () => {
      alive = false;
      window.clearTimeout(guard);
    };
  }, []); // сцена живёт один бросок

  // звук: замах — на ударе, попадание — по исходу (крит громче, царапина тише), ответный удар — на промахе
  useEffect(() => {
    if (step === 'attack') play('swing');
    if (step === 'impact' && outcome !== 'miss') play('hit', { gain: outcome === 'crit' ? 1 : outcome === 'hit' ? 0.8 : 0.4 });
    if (step === 'impact' && outcome === 'crit') play('crit', { delay: 150 });
    if (step === 'counter') play('flinch', { delay: 250 });
  }, [step]); // исход постоянен на время сцены

  useEffect(() => {
    if (step === 'approach') later(() => setStep('attack'), 380);
    if (step === 'impact') later(() => setStep(outcome === 'miss' ? 'counter' : 'hold'), outcome === 'crit' ? 1100 : 800);
    if (step === 'hold') later(() => done.current(), 450);
  }, [step]); // исход постоянен на время сцены

  const heroRanged = ranged(hero);
  const foeRanged = ranged(foe);
  const size = Math.round(Math.min(window.innerHeight * 0.355, window.innerWidth * 0.2));

  // Где стоят фигурки по шагам (в % ширины).
  const heroX = step === 'load' ? -12 : step === 'enter' ? ME_X : heroRanged ? ME_X : FOE_X - MELEE_GAP - (outcome === 'miss' && (step === 'counter' || step === 'hold') ? 4 : 0);
  const foeX = outcome === 'crit' && (step === 'impact' || step === 'hold') ? FOE_X + 10 : step === 'counter' && !foeRanged && !heroRanged ? FOE_X - 3 : FOE_X;

  const heroPose: Pose =
    step === 'load' || step === 'enter' || step === 'approach'
      ? 'walk'
      : step === 'attack'
        ? 'attack'
        : outcome === 'miss' && step === 'counter' && effect === 'complication'
          ? 'hurt'
          : 'idle';
  const foePose: Pose = step === 'counter' ? 'attack' : outcome === 'crit' && (step === 'impact' || step === 'hold') ? 'hurt' : 'idle';

  const impact = step === 'impact' || step === 'hold' || step === 'counter';
  const counterHit = outcome === 'miss' && (step === 'counter' || step === 'hold');
  const projectile = heroRanged && step === 'attack';

  return (
    <m.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, x: outcome === 'crit' && step === 'impact' ? [0, -18, 14, -8, 0] : 0 }}
      exit={{ opacity: 0, transition: { duration: 0.45 } }}
      transition={{ opacity: { duration: 0.35 }, x: { duration: 0.4 } }}
      aria-hidden="true"
    >
      {/* небо, трава в клетку, край травы, затемнение снизу — как в макете */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#23302a_0%,#18201b_46%,#0d0f0d_100%)]" />
      <div
        className="absolute inset-x-0 top-[51.8%] h-[27.8%] bg-[#2d3b26]"
        style={{
          backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,.18) 50%, transparent 50%), linear-gradient(rgba(0,0,0,.14) 50%, transparent 50%)',
          backgroundSize: '3vh 3vh, 3vh 3vh',
        }}
      />
      <div className="absolute inset-x-0 top-[50.7%] h-[1.5%] bg-[repeating-linear-gradient(90deg,#3d5233_0_1.5vh,#4a6340_1.5vh_3vh)]" />
      <div className="absolute inset-x-0 top-[79.6%] bottom-0 bg-[linear-gradient(rgba(13,15,13,.2),#0d0f0d_60%)]" />

      <div className="absolute inset-x-[5vw] top-[13vh] text-center text-[clamp(18px,1.6vw,32px)] tracking-[.08em] text-[#c2cbbf] uppercase">
        <span className="text-[#f5f7f2]">{heroName}</span> против <span className="text-[#ff8b8b]">{foeName}</span>
      </div>

      <Fighter x={heroX} size={size} figure={hero} pose={heroPose} dir="right" step={step} name={heroName} speed={step === 'enter' ? 0.85 : 0.38}>
        {counterHit && <Flinch key="hero-hit" big={effect === 'complication'} />}
      </Fighter>
      <Fighter
        x={foeX}
        size={size}
        figure={foe}
        pose={foePose}
        dir="left"
        step={step}
        name={foeName}
        speed={outcome === 'crit' ? 0.5 : 0.3}
        shake={outcome === 'hit' && step === 'impact'}
        dodge={outcome === 'miss' && step === 'attack'}
        dim={outcome === 'scratch' && impact}
      />

      {/* снаряд: стрела или сгусток магии */}
      <AnimatePresence>
        {projectile && (
          <m.div
            key="shot"
            className="absolute top-[55%]"
            initial={{ left: `${ME_X + 4}%`, opacity: 0 }}
            animate={{ left: `${outcome === 'miss' ? FOE_X + 14 : FOE_X - 3}%`, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: attackOf(hero) === 'shoot' ? 0.55 : 0.4, duration: 0.32, ease: 'easeIn' }}
          >
            {attackOf(hero) === 'shoot' ? (
              <div className="h-[0.5vh] w-[6vh] bg-[linear-gradient(90deg,#c9b48a_0_85%,#e8e3d3_85%)]" />
            ) : (
              <div className="size-[4vh] rounded-full bg-[radial-gradient(circle,#e9fff2_0%,#6fe0a6_45%,transparent_70%)] shadow-[0_0_3vh_#6fe0a6]" />
            )}
          </m.div>
        )}
      </AnimatePresence>

      {/* попадание: искры и всплывающее число (или «мимо») */}
      <AnimatePresence>
        {step === 'impact' && (
          <m.div key="num" className="absolute top-[30%]" style={{ left: `${outcome === 'crit' ? FOE_X + 6 : FOE_X}%` }}>
            {outcome !== 'miss' && <Sparks big={outcome === 'crit'} dull={outcome === 'scratch'} />}
            <m.div
              initial={{ y: 0, opacity: 0, scale: 0.6 }}
              animate={{ y: '-6vh', opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="-translate-x-1/2 font-['IBM_Plex_Mono',monospace] text-[clamp(48px,8.9vh,110px)] leading-none font-medium tabular-nums"
              style={{ color: NUM_COLOR[outcome], textShadow: `0 0.4vh 0 #0d0f0d, 0 0 2.4vh ${NUM_COLOR[outcome]}80` }}
            >
              {outcome === 'miss' ? 'мимо' : value}
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* вспышка крита */}
      <AnimatePresence>
        {outcome === 'crit' && step === 'impact' && (
          <m.div key="flash" className="absolute inset-0 bg-white" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }} />
        )}
      </AnimatePresence>
      <OnAttackEnd step={step} hero={hero} onImpact={() => setStep('impact')} onCounterEnd={() => setStep('hold')} foe={foe} />
    </m.div>
  );
}

/** Длительность анимации атаки (кадры LPC и скорость FigureSprite) — когда наступает удар. */
const ATTACK_MS: Record<string, number> = { slash: 520, thrust: 680, spellcast: 720, shoot: 960 };

function OnAttackEnd({ step, hero, foe, onImpact, onCounterEnd }: { step: Step; hero: Figure; foe: Figure; onImpact: () => void; onCounterEnd: () => void }) {
  const fire = useRef(onImpact);
  fire.current = onImpact;
  const end = useRef(onCounterEnd);
  end.current = onCounterEnd;
  useEffect(() => {
    if (step === 'attack') {
      const ranged = attackOf(hero) === 'shoot' || attackOf(hero) === 'spellcast';
      const t = window.setTimeout(() => fire.current(), (ATTACK_MS[attackOf(hero)] ?? 600) + (ranged ? 200 : 0));
      return () => window.clearTimeout(t);
    }
    if (step === 'counter') {
      const t = window.setTimeout(() => end.current(), (ATTACK_MS[attackOf(foe)] ?? 600) + 500);
      return () => window.clearTimeout(t);
    }
  }, [step]);
  return null;
}

function Fighter({
  x,
  size,
  figure,
  pose,
  dir,
  step,
  name,
  speed,
  shake,
  dodge,
  dim,
  children,
}: {
  x: number;
  size: number;
  figure: Figure;
  pose: Pose;
  dir: 'left' | 'right';
  step: Step;
  name: string;
  speed: number;
  shake?: boolean;
  dodge?: boolean;
  dim?: boolean;
  children?: ReactNode;
}) {
  return (
    <m.div
      className="absolute top-[33.3%]"
      initial={false}
      animate={{ left: `${x}%`, y: dodge ? ['0vh', '-4vh', '0vh'] : 0, x: shake ? [0, 22 * (dir === 'left' ? 1 : -1), -8, 0] : 0 }}
      transition={{ left: { duration: speed, ease: step === 'enter' ? 'linear' : 'easeOut' }, y: { duration: 0.5, delay: 0.25 }, x: { duration: 0.35 } }}
      style={{ width: size, height: size, marginLeft: -size / 2 }}
    >
      <div className="absolute left-1/2 h-[11.5%] w-[57%] -translate-x-1/2 rounded-[50%] bg-black/45" style={{ top: '93%' }} />
      <m.div
        className="absolute inset-0"
        animate={{ filter: shake ? ['brightness(1)', 'brightness(2.2) saturate(.3)', 'brightness(1)'] : dim ? 'brightness(.95)' : 'brightness(1)' }}
        transition={{ duration: 0.35 }}
      >
        <FigureSprite key={`${pose}-${step}`} figure={figure} pose={pose} dir={dir} size={size} once={pose === 'attack' || pose === 'hurt'} className="absolute inset-0" />
      </m.div>
      {children}
      <div className={cn('absolute left-1/2 -translate-x-1/2 text-[clamp(16px,1.4vw,28px)] whitespace-nowrap text-[#c2cbbf]')} style={{ top: '104%' }}>
        {name}
      </div>
    </m.div>
  );
}

/** Игрок пропустил ответный удар: красная вспышка и отскок. */
function Flinch({ big }: { big: boolean }) {
  return (
    <m.div
      className="absolute inset-[20%] rounded-full bg-[radial-gradient(circle,rgba(255,110,110,.55),transparent_65%)]"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: [0, 1, 0], scale: big ? 1.4 : 1.1 }}
      transition={{ duration: 0.5, delay: 0.45 }}
    />
  );
}

/** Пиксельные искры удара. dull — «лишь царапина»: пара серых искр. */
function Sparks({ big, dull }: { big: boolean; dull: boolean }) {
  const n = dull ? 4 : big ? 14 : 9;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.4;
        const r = (big ? 13 : dull ? 5 : 9) * (0.7 + ((i * 37) % 10) / 25);
        return (
          <m.span
            key={i}
            className="absolute top-[15vh] left-0 size-[1.1vh]"
            style={{ background: dull ? '#b8bdb3' : i % 3 ? '#ffe9a8' : '#ffffff' }}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: `${Math.cos(a) * r}vh`, y: `${Math.sin(a) * r}vh`, opacity: 0 }}
            transition={{ duration: big ? 0.7 : 0.5, ease: 'easeOut' }}
          />
        );
      })}
    </>
  );
}
