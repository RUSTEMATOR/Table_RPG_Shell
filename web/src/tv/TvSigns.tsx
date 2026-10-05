import { AnimatePresence, m } from 'motion/react';
import { SIGN_TEXT, type OverloadSign } from '@zg/shared';
import { cn } from '../lib/cn.ts';

export interface Sign {
  character: string;
  sign: OverloadSign;
  at: number;
}

/** Признаки перегрузки на столе: стопка справа внизу, новый въезжает сверху, старые съезжают. Без чисел. */
export function TvSigns({ signs }: { signs: Sign[] }) {
  return (
    <div className="absolute right-[4vw] bottom-[7vh] grid justify-items-end gap-[1vh]" aria-live="polite">
      <AnimatePresence initial={false}>
        {signs.map((s) => (
          <m.div
            key={s.at}
            layout="position"
            initial={{ opacity: 0, x: 60, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.4 } }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
            className={cn(
              'rounded-full border-2 border-solid bg-[rgba(13,15,13,.85)] px-[1.4vw] py-[1vh] text-[clamp(18px,1.6vw,34px)] font-semibold',
              s.sign === 'skin'
                ? 'border-[var(--tv-accent)] text-[var(--tv-ok)] shadow-[0_0_32px_rgba(111,224,166,.35)]'
                : s.sign === 'eyes'
                  ? 'border-[var(--tv-warn)] text-[var(--tv-warn)] shadow-[0_0_24px_rgba(240,196,111,.25)]'
                  : 'border-[var(--tv-line)] text-[var(--tv-muted)]',
            )}
          >
            {s.character}: {SIGN_TEXT[s.sign]}
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
