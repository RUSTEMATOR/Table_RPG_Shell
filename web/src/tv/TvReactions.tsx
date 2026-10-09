import { AnimatePresence, m } from 'motion/react';
import { REACTION_LABELS, type Reaction, type TableReaction } from '@zg/shared';
import { GameIcon, type GameIconName } from '../ui/GameIcon.tsx';

export const REACTION_ICON: Record<Reaction, GameIconName> = { awe: 'sparkles', dread: 'hazard-sign', laugh: 'conversation', cheer: 'laurel-crown' };
const COLOR: Record<Reaction, string> = { awe: '#e8c25a', dread: '#c46a5a', laugh: '#7fc8a9', cheer: '#9fb6ff' };

/** Отклики игроков на столе (этап 52): значок с подписью всплывает снизу и тает. Положение по горизонтали — от времени. */
export function TvReactions({ list }: { list: TableReaction[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[60vh] overflow-hidden" aria-hidden="true">
      <AnimatePresence>
        {list.map((r) => (
          <m.div
            key={`${r.at}-${r.who}`}
            className="absolute bottom-[4vh] grid justify-items-center gap-[0.4vh]"
            style={{ left: `${12 + ((r.at / 7) % 76)}%`, color: COLOR[r.kind] }}
            initial={{ opacity: 0, y: 30, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-0, -120, -260, -360], scale: [0.6, 1.15, 1, 0.95] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, ease: 'easeOut' }}
          >
            <GameIcon name={REACTION_ICON[r.kind]} className="size-[clamp(36px,4.5vw,84px)] drop-shadow-[0_4px_18px_rgba(0,0,0,.6)]" />
            <b className="text-[clamp(18px,1.8vw,38px)] [text-shadow:0_2px_10px_rgba(0,0,0,.7)]">{REACTION_LABELS[r.kind]}</b>
            <span className="text-[clamp(12px,0.9vw,20px)] text-[var(--tv-muted)] [text-shadow:0_2px_8px_rgba(0,0,0,.7)]">{r.who}</span>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
