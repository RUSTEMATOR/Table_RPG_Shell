import { useState } from 'react';
import { SHELL_LABELS, type Shell, type ShellsPlayer } from '@zg/shared';
import { THEMES, baseTheme } from '../lib/cardTheme/index.ts';
import { shellOf } from '../lib/cardTheme/shells.ts';
import { api } from '../lib/api.ts';
import { relLum } from '../lib/cardTheme/engine.mjs';
import { Button, Sheet, toast } from '../ui/index.ts';
import { cn } from '../lib/cn.ts';
import { useActivity } from '../lib/activity.ts';

const OPTIONS = Object.entries(THEMES)
  .filter(([k]) => !k.includes('~'))
  .sort((a, b) => a[1].label.localeCompare(b[1].label, 'ru'));

/** Оболочки, открытые игроку (этап 51): «Книга», оболочка темы персонажа и выбранные за открытия. */
export function openShells(base: string, picked: readonly Shell[]): Set<Shell> {
  return new Set<Shell>(['book', shellOf(baseTheme(base)), ...picked]);
}
export const themeAllowed = (k: string, base: string, picked: readonly Shell[]) => openShells(base, picked).has(shellOf(baseTheme(k)));

/**
 * Выбор оформления игроком: только на этом устройстве, поверх темы персонажа (её задал мастер или вселенная).
 * Кнопка с названием текущей темы открывает лист с образцами; выбор применяется сразу, лист можно не закрывать.
 * Темы закрытых оболочек (этап 51) — с замком; есть доступное открытие — оболочку можно открыть прямо здесь.
 */
export function ThemeChoice({ base, value, onChange, shells }: { base: string; value: string; onChange: (k: string) => void; shells: ShellsPlayer }) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useActivity('card', open ? { kind: 'card.theme' } : null);
  const baseLabel = (THEMES[base] ?? THEMES.other!).label;
  const label = value ? (THEMES[value]?.label ?? baseLabel) : baseLabel;
  const unlocked = openShells(base, shells.picked);
  const askShell = ask ? shellOf(baseTheme(ask)) : null;
  const unlock = async () => {
    if (!ask || !askShell) return;
    setBusy(true);
    const r = await api('POST', '/api/player/shells', { shell: askShell });
    setBusy(false);
    if (!r.ok) return toast.error(r.error === 'none' ? 'Открытий пока нет' : 'Не получилось');
    toast(`Оболочка «${SHELL_LABELS[askShell]}» открыта`);
    onChange(ask);
    setAsk(null);
  };
  const e = shells.earned;
  return (
    <>
      <Button size="sm" className="self-end" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Оформление · {label}
        {shells.available > 0 ? ' · можно открыть оболочку' : ''}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Оформление" description="Только на этом устройстве. Мастер и стол видят карточку как обычно.">
        <div className="mb-3 grid gap-1 rounded-control border border-dashed border-border p-2.5 text-[13.6px]">
          <span>
            Оболочки: открыто {unlocked.size} из 16{shells.available > 0 ? ` · можно открыть ещё ${shells.available}` : ''}.
          </span>
          <span className="text-muted">
            Открытия даются за вехи: 2 памятных момента ({e.moments}), викторина без ошибок ({e.quizzes}), 3 чудища в бестиарии ({e.beasts}), 3 сыгранные сессии ({e.sessions})
            {e.gifts ? `, подарки мастера (${e.gifts})` : ''}.
          </span>
          {ask && askShell && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="grow">
                Открыть оболочку «{SHELL_LABELS[askShell]}» (тема «{THEMES[ask]?.label}»)?
              </span>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void unlock()}>
                Открыть
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAsk(null)}>
                Отмена
              </Button>
            </div>
          )}
        </div>
        <div role="radiogroup" aria-label="Оформление" className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3">
          <Swatch k={base} label={`Как у персонажа: «${baseLabel}»`} on={!value} onPick={() => onChange('')} wide />
          {OPTIONS.map(([k, t]) => {
            const locked = !unlocked.has(shellOf(baseTheme(k)));
            return (
              <Swatch
                key={k}
                k={k}
                label={locked ? `${t.label} · ${SHELL_LABELS[shellOf(baseTheme(k))]}` : t.label}
                on={value === k}
                locked={locked}
                onPick={() => {
                  if (!locked) return onChange(k);
                  if (shells.available > 0) setAsk(k);
                  else toast(`Оболочка «${SHELL_LABELS[shellOf(baseTheme(k))]}» ещё закрыта — её откроют вехи кампании`);
                }}
              />
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

/** Образец темы её собственными цветами: фон, панель, акцент. */
function Swatch({ k, label, on, onPick, wide, locked }: { k: string; label: string; on: boolean; onPick: () => void; wide?: boolean; locked?: boolean }) {
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
        locked && 'opacity-55 saturate-50',
      )}
    >
      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: t.panel, boxShadow: `inset 0 0 0 1px ${accent}55` }}>
        <span className="size-3 rounded-full" style={{ background: accent }} />
      </span>
      <span className="min-w-0">
        {locked && (
          <svg viewBox="0 0 24 24" role="img" aria-label="закрыто" className="mr-1 inline size-3.5 -translate-y-px fill-none stroke-current stroke-2 [stroke-linecap:round]">
            <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
          </svg>
        )}
        {label}
      </span>
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
