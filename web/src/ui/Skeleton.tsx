import { cn } from '../lib/cn.ts';

/** Заглушка, пока грузятся данные. Пульсирует; при «уменьшить движение» — статична. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('rounded-control bg-surface-2 animate-pulse motion-reduce:animate-none', className)} />;
}

/** Кольцевой индикатор ожидания. */
export function Spinner({ className, label = 'Загрузка' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-block size-5 rounded-full border-2 border-solid border-border border-t-accent animate-spin motion-reduce:animate-none', className)} />
  );
}
