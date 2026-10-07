import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { EFFECT_LABELS } from '@zg/shared';
import { isGmRoll, onLiveRoll, type FeedRoll } from '../lib/feed.ts';
import { useMe } from '../lib/me.tsx';
import { capabilities, fullEffects } from '../lib/capabilities.ts';
import { simulateThrow, warmPhysics } from '../dice/physics.ts';
import type { StageRoll } from '../dice/DiceStage.tsx';
import { cn } from '../lib/cn.ts';
import { EFFECT_ICON, GameIcon } from '../ui/GameIcon.tsx';

const DiceStage = lazy(() => import('../dice/DiceStage.tsx'));

/**
 * Мини-лоток в правой колонке мастера: броски игроков вживую (onLiveRoll), по одному, с очередью до трёх.
 * Свои броски мастер видит в «Броске мастера», здесь их нет. Число и исход — после посадки; без 3D — только плашка.
 * Пока колонка не на экране (узкое окно), ничего не просчитывается.
 */
export function MiniTray() {
  const { me } = useMe();
  const three = fullEffects() && capabilities.webgl2();
  const box = useRef<HTMLDivElement>(null);
  const queue = useRef<FeedRoll[]>([]);
  const busy = useRef(false);
  const [stage, setStage] = useState<StageRoll>({ key: '', kind: 'd20', traj: null, value: null });
  const [plate, setPlate] = useState<FeedRoll | null>(null);
  const landed = useRef<FeedRoll | null>(null);

  useEffect(() => {
    if (three) warmPhysics();
  }, [three]);

  const next = async () => {
    const r = queue.current.shift();
    if (!r) {
      busy.current = false;
      return;
    }
    busy.current = true;
    if (!three) {
      setPlate(r);
      window.setTimeout(next, 1500);
      return;
    }
    setPlate(null);
    setStage({ key: r.id, kind: r.kind, traj: null, value: r.value });
    const traj = await Promise.race([simulateThrow(r.kind), new Promise<null>((ok) => window.setTimeout(() => ok(null), 800))]);
    if (traj) {
      landed.current = r;
      setStage((s) => (s.key === r.id ? { ...s, traj } : s));
    } else {
      setStage((s) => ({ ...s, key: '' }));
      setPlate(r);
      window.setTimeout(next, 1500);
    }
  };

  useEffect(
    () =>
      onLiveRoll((r) => {
        if (isGmRoll(r) && r.memberId === me?.member.id) return; // свой бросок
        if (!box.current || box.current.offsetWidth === 0) return; // колонка скрыта
        queue.current = [...queue.current, r].slice(-3);
        if (!busy.current) void next();
      }),
    [me?.member.id, three], // next читает только ref и стабильные сеттеры
  );

  const onLanded = () => {
    const r = landed.current;
    landed.current = null;
    if (r) setPlate(r);
    window.setTimeout(next, 1200);
  };

  return (
    <div ref={box} className={cn('relative overflow-hidden rounded-control border border-solid border-border bg-surface-2', three ? 'h-[150px]' : 'min-h-14')}>
      {three && (
        <Suspense fallback={null}>
          <DiceStage className="!absolute inset-0" roll={stage} budget={1.1} onLanded={onLanded} onLost={() => setPlate(landed.current)} />
        </Suspense>
      )}
      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-2">
        {plate ? (
          <span className="flex max-w-full items-baseline gap-2 truncate rounded-full border border-solid border-border bg-surface px-3 py-1 shadow-card">
            <span className="truncate font-ui text-[13px] text-muted">{plate.character ?? plate.who}</span>
            <b className="font-mono text-xl font-medium tabular-nums">{plate.value}</b>
            <span className="font-ui text-[13px] font-semibold">
              <GameIcon name={EFFECT_ICON[plate.effect]} className="mr-1" />
              {EFFECT_LABELS[plate.effect]}
            </span>
          </span>
        ) : (
          !stage.key && <span className="font-ui text-xs tracking-[.06em] text-muted uppercase">Броски игроков</span>
        )}
      </div>
    </div>
  );
}
