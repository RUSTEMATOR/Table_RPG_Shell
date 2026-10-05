import { THEMES, fontsHref, isTheme, themeCss, themeFamilies, themeFor } from './engine.mjs';

export { catChipHtml, dot, esc, mdLite, ornSvg, pictoSvg, settingThemeOf, DEMAND_WORDS, THEMES } from './engine.mjs';
export { magicSpin, mountMagic } from './magic.mjs';
export { baseTheme, themeVariant } from './variant.ts';

// DOM-часть оформления (ensureTheme / requestFonts артефакта): правило темы — один раз в <style id="ct-css">,
// шрифты темы — одной ссылкой на Google Fonts при первом показе.

const done = new Set<string>();
// Три шрифта, которые в артефакте подключены в <head> (PRELOADED_FONTS): у нас — при первом показе карточки.
const BASE_FONTS = 'https://fonts.googleapis.com/css2?family=Oranienbaum&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';
const fontReq = new Map<string, Promise<void>>();

/** Тема карточки: выбор мастера, иначе вселенная, иначе жанр, иначе «Зеленогорье». */
export function resolveTheme(look: { theme: string; universe: string; genre: string }): string {
  return themeFor({ cardTheme: look.theme, universe: look.universe, source: look.genre });
}

export function ensureTheme(id: string, gm = false): void {
  if (!isTheme(id) || done.has(id)) return;
  try {
    let st = document.getElementById('ct-css');
    if (!st) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = BASE_FONTS;
      document.head.appendChild(l);
      st = document.createElement('style');
      st.id = 'ct-css';
      document.head.appendChild(st);
    }
    st.appendChild(document.createTextNode(themeCss(id, gm)));
    done.add(id);
    requestFonts(themeFamilies(id, gm));
  } catch {
    /* оформление необязательно: без него карточка остаётся в цветах приложения */
  }
}

function requestFonts(fams: string[]): void {
  const need = fams.filter((f) => !fontReq.has(f));
  const href = fontsHref(need);
  if (!href) return;
  const p = new Promise<void>((res) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = l.onerror = () => res();
    document.head.appendChild(l);
    setTimeout(res, 3000);
  });
  need.forEach((f) => fontReq.set(f, p));
}

export const themeData = (id: string) => THEMES[id] ?? THEMES.other!;
export const isThemeKey = (k: string) => isTheme(k);
