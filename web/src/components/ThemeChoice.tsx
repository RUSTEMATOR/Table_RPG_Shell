import { useState } from 'react';
import { THEMES } from '../lib/cardTheme/index.ts';
import { relLum } from '../lib/cardTheme/engine.mjs';
import { Button, Sheet } from '../ui/index.ts';
import { cn } from '../lib/cn.ts';

const OPTIONS = Object.entries(THEMES)
  .filter(([k]) => !k.includes('~'))
  .sort((a, b) => a[1].label.localeCompare(b[1].label, 'ru'));

/**
 * Выбор оформления игроком: только на этом устройстве, поверх темы персонажа (её задал мастер или вселенная).
 * Кнопка с названием текущей темы открывает лист с образцами; выбор применяется сразу, лист можно не закрывать.
 */
export function ThemeChoice({ base, value, onChange }: { base: string; value: string; onChange: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const baseLabel = (THEMES[base] ?? THEMES.other!).label;
  const label = value ? (THEMES[value]?.label ?? baseLabel) : baseLabel;
  return (
    <>
      <Button size="sm" className="self-end" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Оформление · {label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Оформление" description="Только на этом устройстве. Мастер и стол видят карточку как обычно.">
        <div role="radiogroup" aria-label="Оформление" className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3">
          <Swatch k={base} label={`Как у персонажа: «${baseLabel}»`} on={!value} onPick={() => onChange('')} wide />
          {OPTIONS.map(([k, t]) => (
            <Swatch key={k} k={k} label={t.label} on={value === k} onPick={() => onChange(k)} />
          ))}
        </div>
      </Sheet>
    </>
  );
}

/** Образец темы её собственными цветами: фон, панель, акцент. */
function Swatch({ k, label, on, onPick, wide }: { k: string; label: string; on: boolean; onPick: () => void; wide?: boolean }) {
  const t = THEMES[k] ?? THEMES.other!;
  const accent = typeof t.accent === 'string' ? t.accent : t.ink;
  // Подпись лежит на фоне темы: её цвет — hink («текст на фоне»), а не ink (он для светлой панели карточки).
  // Если и он не читается, берём чёрный или белый — что контрастнее.
  const text = readable(typeof t.hink === 'string' ? t.hink : t.ink, t.bg);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      style={{ background: t.bg, color: text }}
      className={cn(
        'flex min-h-14 cursor-pointer items-center gap-2.5 rounded-control border-2 border-solid px-3 py-2 text-left font-ui text-sm leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        on ? 'border-accent' : 'border-transparent shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]',
        wide && 'col-span-full',
      )}
    >
      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: t.panel, boxShadow: `inset 0 0 0 1px ${accent}55` }}>
        <span className="size-3 rounded-full" style={{ background: accent }} />
      </span>
      <span className="min-w-0">{label}</span>
    </button>
  );
}

const contrast = (a: string, b: string) => {
  const x = relLum(a),
    y = relLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Цвет текста, читаемый на фоне bg (контраст не меньше 4,5). */
function readable(ink: string, bg: string): string {
  if (contrast(ink, bg) >= 4.5) return ink;
  return contrast('#000000', bg) >= contrast('#ffffff', bg) ? '#111111' : '#f7f4ec';
}
