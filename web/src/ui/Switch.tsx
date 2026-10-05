import { Switch as S } from 'radix-ui';
import { cn } from '../lib/cn.ts';

/** Переключатель «да/нет» с подписью справа. */
export function Switch({ checked, onCheckedChange, label, id, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; id?: string; className?: string }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-3 font-ui text-[15px] text-text', className)}>
      <S.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 bg-border p-0 transition-colors duration-150 data-[state=checked]:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-surface shadow transition-transform duration-150 data-[state=checked]:translate-x-[22px] motion-reduce:transition-none" />
      </S.Root>
      {label}
    </label>
  );
}
