import type { ReactNode } from 'react';
import { Popover as P, Tooltip as T } from 'radix-ui';
import { cn } from '../lib/cn.ts';

const floating =
  'z-50 rounded-card border border-solid border-border bg-surface text-text shadow-[0_12px_32px_rgba(20,26,21,.18)] transition-[opacity,scale] duration-150 starting:scale-95 starting:opacity-0 motion-reduce:transition-none';

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ children, className, align = 'center' }: { children: ReactNode; className?: string; align?: 'start' | 'center' | 'end' }) {
  return (
    <P.Portal>
      <P.Content sideOffset={8} align={align} collisionPadding={12} className={cn(floating, 'p-3', className)}>
        {children}
      </P.Content>
    </P.Portal>
  );
}

export const TooltipProvider = T.Provider;
/** Подсказка к значку или сокращению. Не прячьте в неё важное: на телефоне её нет. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content sideOffset={6} className="z-50 rounded-control bg-text px-2.5 py-1.5 font-ui text-[13px] text-surface shadow-md transition-opacity duration-150 starting:opacity-0">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export { floating as floatingClass };
