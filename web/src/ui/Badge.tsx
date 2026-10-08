import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

const badge = cva(
  'zg-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-ui text-[11.2px] font-semibold uppercase tracking-[.06em] leading-[14px] whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-muted',
        accent: 'bg-accent-soft text-text',
        ok: 'bg-ok-soft text-ok',
        warn: 'bg-warn-soft text-warn',
        danger: 'bg-danger-soft text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({ className, tone, ...rest }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...rest} />;
}

/** Точка «есть новое» (вкладки, счётчики). */
export function Dot({ className }: { className?: string }) {
  return <span aria-label="есть новое" className={cn('inline-block size-2 rounded-full bg-accent ring-2 ring-surface', className)} />;
}
