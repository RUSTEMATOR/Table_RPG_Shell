import type { PlayerCharacter } from '@zg/shared';
import { useCatalog } from '../lib/gm.ts';
import { THEMES, isThemeKey, resolveTheme, themeData } from '../lib/cardTheme/index.ts';
import { Field, Select } from '../ui/index.ts';

/** «Оформление» карточки, как в артефакте (themeOptionsHtml): «Авто: …», жанры, вселенные по алфавиту. */
export function ThemePick({ look, onPick }: { look: PlayerCharacter['look']; onPick: (key: string) => void }) {
  const catalog = useCatalog();
  const auto = resolveTheme({ ...look, theme: '' });
  const genres = (catalog?.sources ?? []).filter((s) => isThemeKey(s.key));
  const unis = (catalog?.universes ?? []).filter((u) => isThemeKey(u.key)).sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  return (
    <Field label="Оформление карточки">
      {(id) => (
        <Select
          id={id}
          value={look.theme || 'auto'}
          onValueChange={(v) => onPick(v === 'auto' ? '' : v)}
          options={[
            { value: 'auto', label: `Авто: ${themeName(auto, catalog?.universes)}` },
            ...genres.map((g) => ({ value: g.key, label: `${themeData(g.key).label} · ${g.label}`, group: 'Жанры' })),
            ...unis.map((u) => ({ value: u.key, label: u.label, group: 'Вселенные' })),
          ]}
        />
      )}
    </Field>
  );
}

function themeName(id: string, unis?: { key: string; label: string }[]): string {
  return unis?.find((u) => u.key === id)?.label ?? (THEMES[id] ?? THEMES.other!).label;
}
