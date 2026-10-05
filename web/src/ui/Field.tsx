import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

/** Поле с подписью ЗАГЛАВНЫМИ сверху, подсказкой и ошибкой снизу. children получает id через render-prop. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="font-ui text-[12.8px] font-medium uppercase tracking-[.06em] text-muted">
        {label}
      </label>
      {children(id, hint || error ? noteId : undefined)}
      {(error || hint) && (
        <p id={noteId} className={cn('m-0 text-[13.6px] leading-5', error ? 'text-danger' : 'text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
