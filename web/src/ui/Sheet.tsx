import type { ReactNode } from 'react';
import { Dialog as D } from 'radix-ui';
import { m, useDragControls } from 'motion/react';
import { cn } from '../lib/cn.ts';
import { spring } from '../lib/motion.tsx';
import { overlayClass } from './Dialog.tsx';
import { useKeyboardInset } from '../lib/keyboard.ts';
import { DESKTOP_QUERY, useMedia } from '../lib/media.ts';

/**
 * Лист снизу (телефон): закрывается свайпом вниз, тапом по затемнению и «Назад». Учитывает безопасную зону и клавиатуру.
 * На компьютере (широкое окно и мышь) — панель справа: выезжает сбоку, закрывается Esc и щелчком по затемнению.
 */
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
  const side = useMedia(DESKTOP_QUERY);
  if (side)
    return (
      <D.Root open={open} onOpenChange={onOpenChange}>
        <D.Portal>
          <D.Overlay className={overlayClass} />
          <D.Content asChild aria-describedby={undefined}>
            <m.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              transition={spring.sheet}
              className={cn(
                'zg-sheet fixed inset-y-0 right-0 z-50 grid w-[min(520px,100vw)] content-start gap-3 overflow-y-auto overscroll-contain rounded-l-sheet bg-surface px-6 pt-6 pb-8 text-text shadow-[-8px_0_32px_rgba(20,26,21,.18)] focus:outline-none',
                className,
              )}
            >
              <div className="flex items-start gap-3">
                <D.Title className="m-0 grow font-name text-[1.6rem] font-normal leading-tight">{title}</D.Title>
                <D.Close
                  className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-control border-0 bg-transparent text-muted hover:bg-surface-2 hover:text-text"
                  aria-label="Закрыть"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2 [stroke-linecap:round]">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </D.Close>
              </div>
              {description && <D.Description className="m-0 text-muted">{description}</D.Description>}
              {children}
            </m.div>
          </D.Content>
        </D.Portal>
      </D.Root>
    );
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
              'zg-sheet fixed inset-x-0 bottom-0 z-50 mx-auto grid max-h-[88dvh] w-full max-w-[560px] gap-3 overflow-y-auto overscroll-contain rounded-t-sheet bg-surface px-4 pt-2.5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] text-text shadow-[0_-8px_32px_rgba(20,26,21,.18)] focus:outline-none',
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
