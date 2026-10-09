import { AnimatePresence, m } from 'motion/react';
import { MOMENT_KIND_LABELS, type TableMoment } from '@zg/shared';
import { GameIcon, MOMENT_ICON } from '../ui/GameIcon.tsx';

/** Памятный момент на столе (этап 47): плашка слева внизу на несколько секунд — имя, вид, заголовок. */
export function TvMoments({ list }: { list: TableMoment[] }) {
  return (
    <div className="absolute bottom-[7vh] left-[4vw] grid justify-items-start gap-[1vh]" aria-live="polite">
      <AnimatePresence initial={false}>
        {list.map((x) => (
          <m.div
            key={x.at}
            layout="position"
            initial={{ opacity: 0, x: -60, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40, transition: { duration: 0.4 } }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
            className="flex items-center gap-[0.8vw] rounded-full border-2 border-solid border-[#c9971f] bg-[rgba(13,15,13,.88)] px-[1.4vw] py-[1vh] text-[clamp(18px,1.6vw,34px)] font-semibold text-[#f3ecd9] shadow-[0_0_32px_rgba(201,151,31,.35)]"
          >
            <GameIcon name={MOMENT_ICON[x.kind]} className="size-[1.2em] text-[#e8c25a]" />
            <span>
              {x.character}: {x.title}
              <span className="ml-[0.6em] text-[0.7em] font-normal opacity-70">{MOMENT_KIND_LABELS[x.kind]}</span>
            </span>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
