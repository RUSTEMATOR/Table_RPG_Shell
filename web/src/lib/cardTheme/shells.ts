// Оболочки (этап 38, docs/design-shells.md): тема задаёт не только цвета, но и метафору экрана — книга, манга,
// интерфейс, прибор… Оболочка — слой стилей поверх тех же компонентов, по атрибуту data-shell на <html>.
// Стили оболочки — свой чанк, грузится при первом показе; правила написаны на переменных темы (--ct-*).

import { ensureFonts } from '../fonts.ts';

import { SHELLS, type Shell } from '@zg/shared';

export { SHELLS, type Shell };

const THEME_SHELL: Record<string, Shell> = {
  other: 'book',
  fantasy: 'book',
  hp: 'book',
  witcher: 'book',
  ftm: 'book',
  hist: 'chronicle',
  tc: 'chronicle',
  gow: 'chronicle',
  tes: 'chronicle',
  souls: 'chronicle',
  wh40k: 'chronicle',
  myth: 'fresco',
  percy: 'fresco',
  tsushima: 'ink',
  naruto: 'ink',
  anime: 'manga',
  mha: 'manga',
  fate: 'novel',
  hero: 'comic',
  theboys: 'comic',
  johnwick: 'deco',
  cyber: 'cyber',
  cp2077: 'cyber',
  deusex: 'cyber',
  gits: 'cyber',
  ac: 'cyber',
  scifi: 'console',
  sw: 'console',
  masseffect: 'console',
  steam: 'brass',
  dishonored: 'brass',
  arcane: 'brass',
  fallout: 'terminal',
  stalker: 'pda',
  post: 'pda',
  ersatz: 'pda',
  trenchface: 'pda',
  horror: 'dossier',
  silenthill: 'dossier',
  spn: 'dossier',
  lovecraft: 'dossier',
  fh: 'dossier',
  game: 'pixel',
  minecraft: 'pixel',
  real: 'document',
  breakingbad: 'document',
};

/** Оболочка темы (по основе темы: у «День» / «Ночь» та же). Неизвестная тема — книга. */
export function shellOf(base: string): Shell {
  return THEME_SHELL[base] ?? 'book';
}

/** Какие части набора украшений темы оболочка показывает (остальные есть в наборе, но здесь не к месту). */
export const SHELL_PACK_PARTS: Record<Shell, readonly string[]> = {
  book: ['band', 'tex', 'mark'],
  chronicle: ['band', 'corner', 'tex'],
  fresco: ['band', 'tex'],
  ink: ['pat'],
  manga: [],
  novel: ['mark'],
  comic: [],
  deco: [],
  cyber: [],
  console: [],
  brass: ['tex'],
  terminal: [],
  pda: ['tex'],
  dossier: ['tex'],
  pixel: [],
  document: [],
};

// Стили оболочки и её шрифты (свои, из сборки — lib/fonts.ts, этап 40) грузятся вместе при первом показе.
const LOADERS: Record<Shell, () => Promise<unknown>> = {
  book: () => Promise.all([import('../../styles/shells/book.css'), ensureFonts(['Cormorant SC', 'Cormorant Garamond'])]),
  chronicle: () => Promise.all([import('../../styles/shells/chronicle.css'), ensureFonts(['Old Standard TT'])]),
  fresco: () => Promise.all([import('../../styles/shells/fresco.css'), ensureFonts(['Forum'])]),
  ink: () => Promise.all([import('../../styles/shells/ink.css'), ensureFonts(['Neucha'])]),
  manga: () => Promise.all([import('../../styles/shells/manga.css'), ensureFonts(['Dela Gothic One'])]),
  novel: () => import('../../styles/shells/novel.css'),
  comic: () => Promise.all([import('../../styles/shells/comic.css'), ensureFonts(['Comic Relief'])]),
  deco: () => Promise.all([import('../../styles/shells/deco.css'), ensureFonts(['Poiret One', 'Playfair Display SC'])]),
  cyber: () => Promise.all([import('../../styles/shells/cyber.css'), ensureFonts(['JetBrains Mono'])]),
  console: () => import('../../styles/shells/console.css'),
  brass: () => import('../../styles/shells/brass.css'),
  terminal: () => Promise.all([import('../../styles/shells/terminal.css'), ensureFonts(['Handjet'])]),
  pda: () => Promise.all([import('../../styles/shells/pda.css'), ensureFonts(['Russo One'])]),
  dossier: () => Promise.all([import('../../styles/shells/dossier.css'), ensureFonts(['PT Mono', 'Marck Script'])]),
  pixel: () => Promise.all([import('../../styles/shells/pixel.css'), ensureFonts(['Pixelify Sans'])]),
  document: () => Promise.all([import('../../styles/shells/document.css'), ensureFonts(['Oswald'])]),
};

const loaded = new Set<Shell>();

/** Стили оболочки — один раз; без сети остаётся оформление темы без оболочки. */
export function ensureShell(s: Shell): void {
  if (loaded.has(s)) return;
  loaded.add(s);
  void LOADERS[s]().catch(() => loaded.delete(s));
}
