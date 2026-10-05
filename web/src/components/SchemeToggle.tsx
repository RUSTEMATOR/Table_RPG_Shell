import { SCHEME_LABEL, nextScheme, useScheme } from '../lib/colorScheme.ts';
import { useSkinId } from '../lib/cardTheme/skin.ts';

const ICON = {
  auto: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18',
  light: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4',
  dark: 'M15 3a9 9 0 1 0 6 13a7 7 0 0 1-6-13z',
} as const;

/** Переключатель «Авто → День → Ночь» в шапке. Скрыт, когда экран в теме персонажа со своей палитрой. */
export function SchemeToggle() {
  const scheme = useScheme();
  const skin = useSkinId();
  if (skin && skin !== 'other') return null;
  return (
    <button
      type="button"
      className="btn btn-ghost scheme-toggle"
      onClick={nextScheme}
      title={`Оформление: ${SCHEME_LABEL[scheme]} (нажать, чтобы сменить)`}
      aria-label={`День или ночь: сейчас ${SCHEME_LABEL[scheme]}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={ICON[scheme]} />
      </svg>
      <span>{SCHEME_LABEL[scheme]}</span>
    </button>
  );
}
