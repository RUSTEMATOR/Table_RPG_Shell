import { THEMES } from '../lib/cardTheme/index.ts';

const OPTIONS = Object.entries(THEMES)
  .filter(([k]) => !k.includes('~'))
  .map(([k, t]) => [k, t.label] as const)
  .sort((a, b) => a[1].localeCompare(b[1], 'ru'));

/** Выбор оформления игроком: только на этом устройстве, поверх темы персонажа (её задал мастер или вселенная). */
export function ThemeChoice({ base, value, onChange }: { base: string; value: string; onChange: (k: string) => void }) {
  const baseLabel = (THEMES[base] ?? THEMES.other!).label;
  return (
    <label className="field theme-choice">
      <span>Оформление</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Как у персонажа: «{baseLabel}»</option>
        {OPTIONS.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
