import type { ReactNode } from 'react';
import { Dialog as D } from 'radix-ui';
import { cn } from '../lib/cn.ts';

// Диалог для решений, без которых нельзя продолжить. Всплывающая поверхность — без рамок темы (нет класса card).
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export const overlayClass =
  'fixed inset-0 z-50 bg-[rgba(20,24,20,.5)] backdrop-blur-[2px] transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none';

export function DialogContent({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <D.Portal>
      <D.Overlay className={overlayClass} />
      <D.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-3 rounded-sheet border border-solid border-border bg-surface p-6 text-text shadow-[0_24px_64px_rgba(20,26,21,.28)] transition-[opacity,scale] duration-200 starting:scale-95 starting:opacity-0 focus:outline-none motion-reduce:transition-none',
          className,
        )}
      >
        <D.Title className="m-0 font-name text-[1.5rem] font-normal leading-tight">{title}</D.Title>
        {description ? <D.Description className="m-0 text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        {children}
      </D.Content>
    </D.Portal>
  );
}
