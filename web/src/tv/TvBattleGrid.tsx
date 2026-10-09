import { AnimatePresence, m } from 'motion/react';
import type { BattlePublic } from '@zg/shared';
import { BattleGrid } from '../components/BattleGrid.tsx';

/** Поле боя на столе (этап 60): во весь экран поверх сцены и карты, пока мастер держит его открытым. */
export function TvBattleGrid({ battle }: { battle: BattlePublic | null }) {
  return (
    <AnimatePresence>
      {battle && (
        <m.div
          key="battle"
          className="absolute inset-0 grid place-items-center bg-[rgba(18,20,16,.92)] p-[3vh_4vw]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="grid w-full max-w-[min(92vw,calc(86vh*1.6))] gap-[1.5vh]">
            {battle.title && <h2 className="m-0 font-['Oranienbaum',Georgia,serif] text-[clamp(28px,3vw,60px)] leading-none">{battle.title}</h2>}
            <BattleGrid cols={battle.cols} rows={battle.rows} terrain={battle.terrain} tokens={battle.tokens} big />
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
