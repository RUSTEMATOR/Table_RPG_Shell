import type { ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ru } from '@zg/shared';
import { spring } from '../lib/motion.tsx';
import { Card } from '../ui/index.ts';

/**
 * Рамка входа и приглашения: название по центру, карточка, шаги сменяют друг друга сдвигом.
 * dir — направление: 1 вперёд, -1 назад. При «уменьшить движение» — просто смена.
 */
export function AuthFrame({ step, dir = 1, children }: { step: string; dir?: 1 | -1; children: ReactNode }) {
  return (
    <div className="screen center min-h-dvh">
      <div className="grid w-full max-w-[400px] gap-5">
        <h1 className="m-0 text-center font-name text-[2rem] leading-tight font-normal">
          <span aria-hidden="true" className="mr-2 text-accent">
            ◆
          </span>
          {ru.appName}
        </h1>
        <Card className="overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <m.div
              key={step}
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: 28 * d }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: -28 * d }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={spring.sheet}
              className="grid gap-3"
            >
              {children}
            </m.div>
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}
