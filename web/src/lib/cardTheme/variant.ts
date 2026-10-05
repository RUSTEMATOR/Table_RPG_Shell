import type { Scheme } from '../colorScheme.ts';
import { THEMES, isTheme, mixHex, relLum } from './engine.mjs';

// День и ночь для тем артефакта. У тем одна палитра, поэтому «День» и «Ночь» строят светлый или тёмный вариант
// из её же цветов (светлый и тёмный из пары «панель / текст», акценты те же — контраст подгоняет themeCss).
// «Авто» — тема как задумана. Вариант регистрируется в THEMES под ключом «id~light» / «id~dark»,
// дальше с ним работает весь движок артефакта как с обычной темой.

const dark = (h: string) => relLum(h) < 0.2;

export function themeVariant(id: string, scheme: Scheme): string {
  if (scheme === 'auto' || id === 'other' || !isTheme(id)) return id;
  const T = THEMES[id]!;
  const isDark = dark(T.panel) && dark(T.bg);
  const isLight = !dark(T.panel) && !dark(T.bg);
  if ((scheme === 'dark' && isDark) || (scheme === 'light' && isLight)) return id;
  const key = `${id}~${scheme}`;
  if (!THEMES[key]) {
    const light = relLum(T.panel) >= relLum(T.ink) ? T.panel : T.ink;
    const darkc = light === T.panel ? T.ink : T.panel;
    const v: Record<string, unknown> = { ...T };
    delete v.hink;
    delete v.hmuted;
    delete v.grad;
    if (scheme === 'dark') {
      v.bg = mixHex(darkc, '#000000', 0.3);
      v.panel = mixHex(darkc, light, 0.07);
      v.ink = light;
      v.muted = mixHex(light, darkc, 0.38);
      v.line = mixHex(v.panel as string, light, 0.2);
      // акценты светлых тем рассчитаны на светлый фон: на тёмном их поднимаем (знак, орнамент, ступени)
      for (const k of ['accent', 'accent2', 'seg'] as const) if (typeof v[k] === 'string' && relLum(v[k] as string) < 0.18) v[k] = mixHex(v[k] as string, '#ffffff', 0.4);
    } else {
      v.bg = mixHex(light, darkc, 0.07);
      v.panel = mixHex(light, '#ffffff', 0.5);
      v.ink = darkc;
      v.muted = mixHex(darkc, light, 0.4);
      v.line = mixHex(light, darkc, 0.22);
      for (const k of ['accent', 'accent2', 'seg'] as const) if (typeof v[k] === 'string' && relLum(v[k] as string) > 0.45) v[k] = mixHex(v[k] as string, '#000000', 0.45);
    }
    THEMES[key] = v as unknown as (typeof THEMES)[string];
  }
  return key;
}

/** Исходная тема варианта: частицам и подписи нужна она. */
export const baseTheme = (id: string) => id.split('~')[0]!;
