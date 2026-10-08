import { ensureFont, ensureFonts } from '../fonts.ts';
import { THEMES, isTheme, themeCss, themeFamilies, themeFor } from './engine.mjs';

export { catChipHtml, dot, esc, mdLite, ornSvg, pictoSvg, settingThemeOf, DEMAND_WORDS, THEMES } from './engine.mjs';
export { magicSpin, mountMagic } from './magic.mjs';
export { baseTheme, themeVariant } from './variant.ts';

// DOM-часть оформления (ensureTheme / requestFonts артефакта): правило темы — один раз в <style id="ct-css">,
// шрифты темы — свои, из сборки (lib/fonts.ts, этап 40), по семейству при первом показе.

const done = new Set<string>();
// Три шрифта, которые в артефакте подключены в <head> (PRELOADED_FONTS): у нас — при первом показе карточки.
const BASE_FONTS = ['Oranienbaum', 'IBM Plex Sans', 'IBM Plex Mono'];

/** Тема карточки: выбор мастера, иначе вселенная, иначе жанр, иначе «Зеленогорье». */
export function resolveTheme(look: { theme: string; universe: string; genre: string }): string {
  return themeFor({ cardTheme: look.theme, universe: look.universe, source: look.genre });
}

export function ensureTheme(id: string, gm = false): void {
  if (!isTheme(id) || done.has(id)) return;
  try {
    let st = document.getElementById('ct-css');
    if (!st) {
      void ensureFonts(BASE_FONTS);
      st = document.createElement('style');
      st.id = 'ct-css';
      document.head.appendChild(st);
    }
    st.appendChild(document.createTextNode(themeCss(id, gm)));
    done.add(id);
    for (const f of themeFamilies(id, gm)) void ensureFont(f);
  } catch {
    /* оформление необязательно: без него карточка остаётся в цветах приложения */
  }
}

export const themeData = (id: string) => THEMES[id] ?? THEMES.other!;
export const isThemeKey = (k: string) => isTheme(k);
