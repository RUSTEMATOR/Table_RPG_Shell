import type { PlayerCharacter } from '@zg/shared';
import { useCatalog } from '../lib/gm.ts';
import { THEMES, isThemeKey, resolveTheme, themeData } from '../lib/cardTheme/index.ts';

/** «Оформление» карточки, как в артефакте (themeOptionsHtml): «Авто: …», жанры, вселенные по алфавиту. */
export function ThemePick({ look, onPick }: { look: PlayerCharacter['look']; onPick: (key: string) => void }) {
  const catalog = useCatalog();
  const auto = resolveTheme({ ...look, theme: '' });
  const genres = (catalog?.sources ?? []).filter((s) => isThemeKey(s.key));
  const unis = (catalog?.universes ?? []).filter((u) => isThemeKey(u.key)).sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  return (
    <label className="field">
      <span>Оформление карточки</span>
      <select value={look.theme} onChange={(e) => onPick(e.target.value)}>
        <option value="">Авто: {themeName(auto, catalog?.universes)}</option>
        <optgroup label="Жанры">
          {genres.map((g) => (
            <option key={g.key} value={g.key}>
              {themeData(g.key).label} · {g.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Вселенные">
          {unis.map((u) => (
            <option key={u.key} value={u.key}>
              {u.label}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

function themeName(id: string, unis?: { key: string; label: string }[]): string {
  return unis?.find((u) => u.key === id)?.label ?? (THEMES[id] ?? THEMES.other!).label;
}
