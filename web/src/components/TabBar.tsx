import { useId } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { cn } from '../lib/cn.ts';
import { spring } from '../lib/motion.tsx';

/** Значки вкладок игрока (как в макетах этапа 15). */
export const TAB_ICONS = {
  rolls: 'M12 6a6 6 0 1 0 0 12a6 6 0 0 0 0-12zM12 2v6M12 16v6M2 12h6M16 12h6M12 11.6v.8',
  card: 'M12 3l7 3v5c0 4.5-3 8-7 10c-4-2-7-5.5-7-10V6z',
  diary: 'M6 3h9l3 3v15H6zM15 3v3h3M9 10h6M9 14h6M9 18h4',
  figure: 'M9 21h6M10 21l1-7h2l1 7M8 11h8M12 3a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM12 9v5',
  map: 'M4 18l5-6 4 3 7-10M4 18v.1M9 12v.1M13 15v.1M20 5v.1',
} as const;

export type TabItem<V extends string> = { value: V; label: string; icon: string; dot?: boolean };

/** Нижняя панель вкладок телефона: подложка под выбранной перетекает, значок «есть новое» появляется пружиной. */
export function TabBar<V extends string>({ value, onChange, items, controls }: { value: V; onChange: (v: V) => void; items: TabItem<V>[]; controls?: (v: V) => string }) {
  const group = useId();
  return (
    <nav
      aria-label="Разделы"
      className="-mx-4 grid shrink-0 grid-flow-col auto-cols-fr border-t border-solid border-border bg-surface px-2 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))]"
    >
      {items.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            aria-current={on ? 'page' : undefined}
            aria-controls={controls?.(t.value)}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative flex min-h-[54px] cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent font-ui text-xs font-semibold tracking-[.01em] transition-colors focus-visible:outline-2 focus-visible:outline-accent',
              on ? 'text-accent' : 'text-muted',
            )}
          >
            <span className="relative grid h-7 w-14 place-items-center">
              {on && <m.span layoutId={group} transition={spring.snappy} className="absolute inset-0 rounded-full bg-accent-soft" />}
              <svg viewBox="0 0 24 24" aria-hidden="true" className="relative size-[22px] fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]">
                <path d={t.icon} />
              </svg>
              <AnimatePresence>
                {t.dot && (
                  <m.i
                    key="dot"
                    aria-label="есть новое"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={spring.snappy}
                    className="absolute top-0 right-2.5 size-2.5 rounded-full border-2 border-solid border-surface bg-danger"
                  />
                )}
              </AnimatePresence>
            </span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
