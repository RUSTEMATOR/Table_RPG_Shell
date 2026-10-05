import type { ReactNode } from 'react';
import { Dialog as D } from 'radix-ui';
import { m } from 'motion/react';
import { cn } from '../lib/cn.ts';
import { spring } from '../lib/motion.tsx';
import { overlayClass } from './Dialog.tsx';

/** Лист снизу (телефон): закрывается свайпом вниз, тапом по затемнению и «Назад». Учитывает безопасную зону. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlayClass} />
        <D.Content asChild aria-describedby={undefined}>
          <m.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={spring.sheet}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onOpenChange(false);
            }}
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 mx-auto grid max-h-[88dvh] w-full max-w-[560px] gap-3 overflow-y-auto rounded-t-sheet bg-surface px-4 pt-2.5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] text-text shadow-[0_-8px_32px_rgba(20,26,21,.18)] focus:outline-none',
              className,
            )}
          >
            <div aria-hidden="true" className="mx-auto h-[5px] w-10 cursor-grab rounded-full bg-border" />
            <D.Title className="m-0 font-name text-[1.45rem] font-normal leading-tight">{title}</D.Title>
            {description && <D.Description className="m-0 text-muted">{description}</D.Description>}
            {children}
          </m.div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
