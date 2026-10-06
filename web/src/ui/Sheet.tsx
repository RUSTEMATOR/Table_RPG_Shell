import type { ReactNode } from 'react';
import { Dialog as D } from 'radix-ui';
import { m, useDragControls } from 'motion/react';
import { cn } from '../lib/cn.ts';
import { spring } from '../lib/motion.tsx';
import { overlayClass } from './Dialog.tsx';
import { useKeyboardInset } from '../lib/keyboard.ts';

/** Лист снизу (телефон): закрывается свайпом вниз, тапом по затемнению и «Назад». Учитывает безопасную зону и клавиатуру. */
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
  const kb = useKeyboardInset(open);
  // Тянуть лист вниз можно только за ручку и заголовок: иначе жест перехватывает вертикальную прокрутку содержимого на телефоне.
  const controls = useDragControls();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlayClass} />
        <D.Content asChild aria-describedby={undefined}>
          <m.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={spring.sheet}
            style={kb ? { bottom: kb, maxHeight: `calc(100dvh - ${kb}px - 16px)`, paddingBottom: 16 } : undefined}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onOpenChange(false);
            }}
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 mx-auto grid max-h-[88dvh] w-full max-w-[560px] gap-3 overflow-y-auto overscroll-contain rounded-t-sheet bg-surface px-4 pt-2.5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] text-text shadow-[0_-8px_32px_rgba(20,26,21,.18)] focus:outline-none',
              className,
            )}
          >
            <div className="-mx-4 -mt-2.5 grid touch-none gap-3 px-4 pt-2.5" onPointerDown={(e) => controls.start(e)}>
              <div aria-hidden="true" className="mx-auto h-[5px] w-10 cursor-grab rounded-full bg-border" />
              <D.Title className="m-0 font-name text-[1.45rem] font-normal leading-tight">{title}</D.Title>
            </div>
            {description && <D.Description className="m-0 text-muted">{description}</D.Description>}
            {children}
          </m.div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
