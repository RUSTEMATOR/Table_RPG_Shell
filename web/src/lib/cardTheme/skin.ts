import { useEffect, useSyncExternalStore } from 'react';
import { ensureTheme } from './index.ts';
import { THEMES, isDarkTheme, isTheme, patPrims, patSpec, primsSvgBody, svgDoc, svgUrl, themeCmap, themeCss } from './engine.js';

// Оформление всего экрана по теме карточки («кожа»): тема задаёт токены приложения (styles/app-skin.css),
// рамку всех .card и узор фона. Игроку — тема его персонажа, мастеру — «Зеленогорье» артефакта (id "other").
// Атрибуты ставятся на <html>: data-skin (id темы), data-frame, data-dark.

const done = new Set<string>();

/** Правило темы для экрана: из themeCss берутся --ct-*, --cc-* и подобранные под контраст цвета (под своими именами). */
function skinCss(id: string): string {
  if (id === 'other') {
    // Свои токены у "other" в артефакте — это токены страницы; здесь они заданы в app-skin.css, отсюда только узор.
    const T = THEMES.other!;
    const prims = patPrims('other', 360, 360).map((p) => ({ ...p, a: Math.min(0.06, Number(p.a)) }));
    return `html[data-skin="other"]{--ct-pat:${svgUrl(svgDoc(primsSvgBody(prims, themeCmap(T)), 360, 360))};--ct-pat-rep:repeat;--ct-pat-size:360px 360px}`;
  }
  const rule = themeCss(id, false);
  const body = rule.slice(rule.indexOf('{') + 1, rule.lastIndexOf('}'));
  const rename: Record<string, string> = {
    '--accent': '--ct-link',
    '--accent-soft': '--ct-soft',
    '--on-accent': '--ct-on-link',
    '--muted': '--ct-muted-fit',
    '--cursed': '--ct-danger',
  };
  const out: string[] = [];
  for (const decl of body.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const k = decl.slice(0, i);
    const v = decl.slice(i + 1);
    if (k.startsWith('--ct-') || k.startsWith('--cc-')) out.push(`${k}:${v}`);
    else if (rename[k]) out.push(`${rename[k]}:${v}`);
  }
  if (patSpec(id).mode === 'tile') out.push(`--ct-pat-size:${patSpec(id).tile.map((n) => `${n}px`).join(' ')}`);
  return `html[data-skin="${id}"]{${out.join(';')}}`;
}

function inject(id: string): void {
  ensureTheme(id); // шрифты темы и правило для карточки
  if (done.has(id)) return;
  let st = document.getElementById('ct-skin');
  if (!st) {
    st = document.createElement('style');
    st.id = 'ct-skin';
    document.head.appendChild(st);
  }
  st.appendChild(document.createTextNode(skinCss(id)));
  done.add(id);
}

const skinListeners = new Set<() => void>();
const notify = () => skinListeners.forEach((l) => l());

/** Текущая тема экрана (null — без оформления): шапке нужно знать, есть ли у темы своя палитра. */
export function useSkinId(): string | null {
  return useSyncExternalStore(
    (l) => {
      skinListeners.add(l);
      return () => skinListeners.delete(l);
    },
    () => document.documentElement.dataset.skin ?? null,
  );
}

export function applySkin(id: string | null): void {
  const html = document.documentElement;
  if (!id) {
    delete html.dataset.skin;
    delete html.dataset.frame;
    delete html.dataset.dark;
    notify();
    return;
  }
  const th = isTheme(id) ? id : 'other';
  try {
    inject(th);
  } catch {
    return; // без оформления остаётся обычный вид приложения
  }
  const T = THEMES[th]!;
  html.dataset.skin = th;
  html.dataset.frame = String(T.frame);
  if (th !== 'other' && isDarkTheme(T)) html.dataset.dark = '1';
  else delete html.dataset.dark;
  notify();
}

/** Оформление экрана на время жизни компонента. null — обычный вид, undefined — не трогать (решает другой компонент). */
export function useSkin(id: string | null | undefined): void {
  useEffect(() => {
    if (id === undefined) return;
    applySkin(id);
    return () => applySkin(null);
  }, [id]);
}
