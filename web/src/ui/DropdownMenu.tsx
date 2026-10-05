import type { ReactNode } from 'react';
import { DropdownMenu as M } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { floatingClass } from './Popover.tsx';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;

export function DropdownMenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'center' | 'end' }) {
  return (
    <M.Portal>
      <M.Content sideOffset={6} align={align} collisionPadding={12} className={cn(floatingClass, 'min-w-48 p-1')}>
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function DropdownMenuItem({ children, onSelect, danger }: { children: ReactNode; onSelect?: () => void; danger?: boolean }) {
  return (
    <M.Item
      onSelect={onSelect}
      className={cn('flex min-h-10 cursor-pointer items-center gap-2 rounded-control px-3 py-2 font-ui text-[15px] outline-none select-none data-[highlighted]:bg-accent-soft', danger && 'text-danger')}
    >
      {children}
    </M.Item>
  );
}
