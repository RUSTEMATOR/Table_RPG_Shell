import { useId } from 'react';
import { ToggleGroup, Tabs as T } from 'radix-ui';
import { m } from 'motion/react';
import { cn } from '../lib/cn.ts';
import { spring } from '../lib/motion.tsx';

export type Option<V extends string> = { value: V; label: string };

/** Выбор одного из 2–4 вариантов на месте (d10/d20, кто видит, «Все / Мои»). Индикатор перетекает. */
export function Segmented<V extends string>({ value, onChange, options, label, className }: { value: V; onChange: (v: V) => void; options: Option<V>[]; label: string; className?: string }) {
  const group = useId();
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as V)}
      aria-label={label}
      className={cn('inline-grid auto-cols-fr grid-flow-col gap-0.5 rounded-[9px] border border-solid border-border bg-surface-2 p-[3px]', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="relative min-h-[38px] cursor-pointer rounded-control border-0 bg-transparent px-4 font-ui text-sm font-semibold text-muted transition-colors data-[state=on]:text-on-primary focus-visible:outline-2 focus-visible:outline-accent"
        >
          {value === o.value && <m.span layoutId={group} transition={spring.snappy} className="absolute inset-0 rounded-control bg-primary" />}
          <span className="relative">{o.label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/** Вкладки раздела (страница персонажа: черты / лист / сводки). Полоска под выбранной перетекает. */
export function Tabs<V extends string>({
  value,
  onChange,
  tabs,
  label,
  children,
}: {
  value: V;
  onChange: (v: V) => void;
  tabs: Option<V>[];
  label: string;
  children: React.ReactNode;
}) {
  const group = useId();
  return (
    <T.Root value={value} onValueChange={(v) => onChange(v as V)} className="grid gap-4">
      <T.List aria-label={label} className="flex gap-1 overflow-x-auto border-b border-solid border-border [scrollbar-width:none]">
        {tabs.map((t) => (
          <T.Trigger
            key={t.value}
            value={t.value}
            className="relative min-h-11 cursor-pointer whitespace-nowrap border-0 bg-transparent px-3 font-ui text-[15px] font-medium text-muted data-[state=active]:text-text focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t.label}
            {value === t.value && <m.span layoutId={group} transition={spring.snappy} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </T.Trigger>
        ))}
      </T.List>
      {children}
    </T.Root>
  );
}
export const TabPanel = T.Content;
