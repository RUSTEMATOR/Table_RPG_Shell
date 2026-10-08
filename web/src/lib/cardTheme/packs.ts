import data from './packs.json';

// Наборы украшений тем (этап 36): маски углов, полосы под заголовком, эмблема, узор фона, зерно, шрифт заголовков.
// Картинки и packs.json собирает tools/extract-art. Цвет масок — от темы (CSS mask-image), поэтому набор один на тему,
// а не на «День» / «Ночь». Правила — в styles/app-skin.css по атрибутам data-pack и data-pk на <html>.

type Part = { src: string; w: number; h: number; size?: number };
export type Pack = { corner?: Part; band?: Part; tex?: Part; pat?: Part; mark?: Part; font?: string };
export type PackCredit = { title: string; author: string; licence: string; page: string; themes: string[] };

const PACKS = data.packs as Record<string, Pack>;
export const PACK_CREDITS = data.credits as PackCredit[];

export function packOf(base: string): Pack | null {
  return PACKS[base] ?? null;
}

/** Части набора для атрибута data-pk: по ним app-skin.css включает свои правила. */
export function packParts(p: Pack): string {
  return (['corner', 'band', 'tex', 'pat', 'mark'] as const).filter((k) => p[k]).join(' ');
}

const url = (s: string) => `url("${s}")`;

/** CSS-переменные набора для темы (правило на html[data-pack]). */
export function packCss(base: string): string {
  const p = PACKS[base];
  if (!p) return '';
  const v: string[] = [];
  if (p.corner) v.push(`--pk-corner:${url(p.corner.src)}`, `--pk-car:${p.corner.w}/${p.corner.h}`);
  if (p.band) v.push(`--pk-band:${url(p.band.src)}`, `--pk-bar:${p.band.w}/${p.band.h}`);
  if (p.tex) v.push(`--pk-tex:${url(p.tex.src)}`);
  if (p.pat) v.push(`--pk-pat:${url(p.pat.src)}`, `--pk-ps:${p.pat.size ?? p.pat.w}px`);
  if (p.mark) v.push(`--pk-mark:${url(p.mark.src)}`, `--pk-mar:${p.mark.w}/${p.mark.h}`);
  // шрифт набора — только заголовкам экрана; карточка персонажа берёт шрифты своей темы
  if (p.font) v.push(`--ct-display:'${p.font}', var(--pk-display-fallback, Georgia, serif)`, `--ct-name:'${p.font}', var(--pk-display-fallback, Georgia, serif)`);
  return `html[data-skin][data-pack="${base}"]{${v.join(';')}}`;
}

const fonts = new Set<string>();

/** Шрифт набора — с Google Fonts при первом показе (как шрифты тем движка). */
export function ensurePackFont(base: string): void {
  const f = PACKS[base]?.font;
  if (!f || fonts.has(f)) return;
  fonts.add(f);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}&display=swap`;
  document.head.appendChild(l);
}
