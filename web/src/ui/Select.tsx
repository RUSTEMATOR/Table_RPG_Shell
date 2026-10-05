import type { ReactNode } from 'react';
import { Select as S } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { floatingClass } from './Popover.tsx';

export type SelectOption = { value: string; label: ReactNode; group?: string };

/** Выбор из списка. Пустое значение не поддерживается Radix — для «нет выбора» используйте своё значение, например 'auto'. */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  className?: string;
  'aria-label'?: string;
}) {
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <S.Root value={value} onValueChange={onValueChange}>
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-control border border-solid border-border bg-surface-2 px-3 py-2 text-left font-ui text-[15px] text-text focus:outline-2 focus:outline-offset-1 focus:outline-accent',
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon className="text-muted">▾</S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className={cn(floatingClass, 'max-h-[min(60dvh,420px)] min-w-[var(--radix-select-trigger-width)] overflow-hidden')}>
          <S.Viewport className="p-1">
            {groups.map((g) => (
              <S.Group key={g}>
                {g && <S.Label className="px-3 pt-2 pb-1 font-ui text-[12px] uppercase tracking-[.06em] text-muted">{g}</S.Label>}
                {options
                  .filter((o) => (o.group ?? '') === g)
                  .map((o) => (
                    <S.Item
                      key={o.value}
                      value={o.value}
                      className="relative flex min-h-10 cursor-pointer items-center rounded-control px-3 py-2 font-ui text-[15px] outline-none select-none data-[highlighted]:bg-accent-soft data-[state=checked]:font-semibold"
                    >
                      <S.ItemText>{o.label}</S.ItemText>
                    </S.Item>
                  ))}
              </S.Group>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
