// Шрифты тем, оболочек, наборов и карты (этап 40): свои, из @fontsource/* (OFL), подмножества cyrillic + latin.
// Грузятся по семейству при первом показе — отдельными CSS-чанками Vite; woff2 кэширует сервис-воркер (zg-fonts).
// Базовые шрифты приложения (Lora, Poppins) подключены статически в styles/main.css.
// Веса — объединение того, что просят движок тем (FONT_SPEC в engine.mjs), оболочки и карта.

const FONTS: Record<string, () => Promise<unknown>> = {
  Oranienbaum: () => Promise.all([import('@fontsource/oranienbaum/cyrillic-400.css'), import('@fontsource/oranienbaum/latin-400.css')]),
  'IBM Plex Sans': () =>
    Promise.all([
      import('@fontsource/ibm-plex-sans/cyrillic-400.css'),
      import('@fontsource/ibm-plex-sans/latin-400.css'),
      import('@fontsource/ibm-plex-sans/cyrillic-500.css'),
      import('@fontsource/ibm-plex-sans/latin-500.css'),
      import('@fontsource/ibm-plex-sans/cyrillic-600.css'),
      import('@fontsource/ibm-plex-sans/latin-600.css'),
    ]),
  'IBM Plex Mono': () =>
    Promise.all([
      import('@fontsource/ibm-plex-mono/cyrillic-400.css'),
      import('@fontsource/ibm-plex-mono/latin-400.css'),
      import('@fontsource/ibm-plex-mono/cyrillic-500.css'),
      import('@fontsource/ibm-plex-mono/latin-500.css'),
    ]),
  Oswald: () =>
    Promise.all([
      import('@fontsource/oswald/cyrillic-400.css'),
      import('@fontsource/oswald/latin-400.css'),
      import('@fontsource/oswald/cyrillic-500.css'),
      import('@fontsource/oswald/latin-500.css'),
      import('@fontsource/oswald/cyrillic-600.css'),
      import('@fontsource/oswald/latin-600.css'),
    ]),
  'Cormorant SC': () =>
    Promise.all([
      import('@fontsource/cormorant-sc/cyrillic-500.css'),
      import('@fontsource/cormorant-sc/latin-500.css'),
      import('@fontsource/cormorant-sc/cyrillic-600.css'),
      import('@fontsource/cormorant-sc/latin-600.css'),
      import('@fontsource/cormorant-sc/cyrillic-700.css'),
      import('@fontsource/cormorant-sc/latin-700.css'),
    ]),
  'Cormorant Garamond': () =>
    Promise.all([
      import('@fontsource/cormorant-garamond/cyrillic-500.css'),
      import('@fontsource/cormorant-garamond/latin-500.css'),
      import('@fontsource/cormorant-garamond/cyrillic-600.css'),
      import('@fontsource/cormorant-garamond/latin-600.css'),
      import('@fontsource/cormorant-garamond/cyrillic-700.css'),
      import('@fontsource/cormorant-garamond/latin-700.css'),
      import('@fontsource/cormorant-garamond/cyrillic-500-italic.css'),
      import('@fontsource/cormorant-garamond/latin-500-italic.css'),
      import('@fontsource/cormorant-garamond/cyrillic-600-italic.css'),
      import('@fontsource/cormorant-garamond/latin-600-italic.css'),
    ]),
  'Cormorant Unicase': () => Promise.all([import('@fontsource/cormorant-unicase/cyrillic-400.css'), import('@fontsource/cormorant-unicase/latin-400.css')]),
  Spectral: () =>
    Promise.all([
      import('@fontsource/spectral/cyrillic-400.css'),
      import('@fontsource/spectral/latin-400.css'),
      import('@fontsource/spectral/cyrillic-600.css'),
      import('@fontsource/spectral/latin-600.css'),
    ]),
  'Exo 2': () =>
    Promise.all([
      import('@fontsource/exo-2/cyrillic-400.css'),
      import('@fontsource/exo-2/latin-400.css'),
      import('@fontsource/exo-2/cyrillic-600.css'),
      import('@fontsource/exo-2/latin-600.css'),
    ]),
  Jura: () =>
    Promise.all([
      import('@fontsource/jura/cyrillic-400.css'),
      import('@fontsource/jura/latin-400.css'),
      import('@fontsource/jura/cyrillic-600.css'),
      import('@fontsource/jura/latin-600.css'),
    ]),
  'Rubik Glitch': () => Promise.all([import('@fontsource/rubik-glitch/cyrillic-400.css'), import('@fontsource/rubik-glitch/latin-400.css')]),
  'Rubik Distressed': () => Promise.all([import('@fontsource/rubik-distressed/cyrillic-400.css'), import('@fontsource/rubik-distressed/latin-400.css')]),
  'Rubik Wet Paint': () => Promise.all([import('@fontsource/rubik-wet-paint/cyrillic-400.css'), import('@fontsource/rubik-wet-paint/latin-400.css')]),
  'Rubik Burned': () => Promise.all([import('@fontsource/rubik-burned/cyrillic-400.css'), import('@fontsource/rubik-burned/latin-400.css')]),
  'Rubik Mono One': () => Promise.all([import('@fontsource/rubik-mono-one/cyrillic-400.css'), import('@fontsource/rubik-mono-one/latin-400.css')]),
  'Press Start 2P': () => Promise.all([import('@fontsource/press-start-2p/cyrillic-400.css'), import('@fontsource/press-start-2p/latin-400.css')]),
  'PT Mono': () => Promise.all([import('@fontsource/pt-mono/cyrillic-400.css'), import('@fontsource/pt-mono/latin-400.css')]),
  'PT Serif': () =>
    Promise.all([
      import('@fontsource/pt-serif/cyrillic-400.css'),
      import('@fontsource/pt-serif/latin-400.css'),
      import('@fontsource/pt-serif/cyrillic-700.css'),
      import('@fontsource/pt-serif/latin-700.css'),
    ]),
  'Ruslan Display': () => Promise.all([import('@fontsource/ruslan-display/cyrillic-400.css'), import('@fontsource/ruslan-display/latin-400.css')]),
  'Old Standard TT': () =>
    Promise.all([
      import('@fontsource/old-standard-tt/cyrillic-400.css'),
      import('@fontsource/old-standard-tt/latin-400.css'),
      import('@fontsource/old-standard-tt/cyrillic-700.css'),
      import('@fontsource/old-standard-tt/latin-700.css'),
      import('@fontsource/old-standard-tt/cyrillic-400-italic.css'),
      import('@fontsource/old-standard-tt/latin-400-italic.css'),
    ]),
  Forum: () => Promise.all([import('@fontsource/forum/cyrillic-400.css'), import('@fontsource/forum/latin-400.css')]),
  Unbounded: () =>
    Promise.all([
      import('@fontsource/unbounded/cyrillic-400.css'),
      import('@fontsource/unbounded/latin-400.css'),
      import('@fontsource/unbounded/cyrillic-600.css'),
      import('@fontsource/unbounded/latin-600.css'),
    ]),
  'Russo One': () => Promise.all([import('@fontsource/russo-one/cyrillic-400.css'), import('@fontsource/russo-one/latin-400.css')]),
  Philosopher: () =>
    Promise.all([
      import('@fontsource/philosopher/cyrillic-400.css'),
      import('@fontsource/philosopher/latin-400.css'),
      import('@fontsource/philosopher/cyrillic-700.css'),
      import('@fontsource/philosopher/latin-700.css'),
    ]),
  'Kelly Slab': () => Promise.all([import('@fontsource/kelly-slab/cyrillic-400.css'), import('@fontsource/kelly-slab/latin-400.css')]),
  Kurale: () => Promise.all([import('@fontsource/kurale/cyrillic-400.css'), import('@fontsource/kurale/latin-400.css')]),
  'Marck Script': () => Promise.all([import('@fontsource/marck-script/cyrillic-400.css'), import('@fontsource/marck-script/latin-400.css')]),
  Prata: () => Promise.all([import('@fontsource/prata/cyrillic-400.css'), import('@fontsource/prata/latin-400.css')]),
  'Playfair Display': () =>
    Promise.all([
      import('@fontsource/playfair-display/cyrillic-400.css'),
      import('@fontsource/playfair-display/latin-400.css'),
      import('@fontsource/playfair-display/cyrillic-700.css'),
      import('@fontsource/playfair-display/latin-700.css'),
    ]),
  'Playfair Display SC': () =>
    Promise.all([
      import('@fontsource/playfair-display-sc/cyrillic-400.css'),
      import('@fontsource/playfair-display-sc/latin-400.css'),
      import('@fontsource/playfair-display-sc/cyrillic-700.css'),
      import('@fontsource/playfair-display-sc/latin-700.css'),
    ]),
  Underdog: () => Promise.all([import('@fontsource/underdog/cyrillic-400.css'), import('@fontsource/underdog/latin-400.css')]),
  'Stalinist One': () => Promise.all([import('@fontsource/stalinist-one/cyrillic-400.css'), import('@fontsource/stalinist-one/latin-400.css')]),
  'Yeseva One': () => Promise.all([import('@fontsource/yeseva-one/cyrillic-400.css'), import('@fontsource/yeseva-one/latin-400.css')]),
  'Amatic SC': () =>
    Promise.all([
      import('@fontsource/amatic-sc/cyrillic-400.css'),
      import('@fontsource/amatic-sc/latin-400.css'),
      import('@fontsource/amatic-sc/cyrillic-700.css'),
      import('@fontsource/amatic-sc/latin-700.css'),
    ]),
  Neucha: () => Promise.all([import('@fontsource/neucha/cyrillic-400.css'), import('@fontsource/neucha/latin-400.css')]),
  'Bad Script': () => Promise.all([import('@fontsource/bad-script/cyrillic-400.css'), import('@fontsource/bad-script/latin-400.css')]),
  'Comic Relief': () =>
    Promise.all([
      import('@fontsource/comic-relief/cyrillic-400.css'),
      import('@fontsource/comic-relief/latin-400.css'),
      import('@fontsource/comic-relief/cyrillic-700.css'),
      import('@fontsource/comic-relief/latin-700.css'),
    ]),
  'Dela Gothic One': () => Promise.all([import('@fontsource/dela-gothic-one/cyrillic-400.css'), import('@fontsource/dela-gothic-one/latin-400.css')]),
  Handjet: () =>
    Promise.all([
      import('@fontsource/handjet/cyrillic-500.css'),
      import('@fontsource/handjet/latin-500.css'),
      import('@fontsource/handjet/cyrillic-700.css'),
      import('@fontsource/handjet/latin-700.css'),
    ]),
  'JetBrains Mono': () =>
    Promise.all([
      import('@fontsource/jetbrains-mono/cyrillic-500.css'),
      import('@fontsource/jetbrains-mono/latin-500.css'),
      import('@fontsource/jetbrains-mono/cyrillic-700.css'),
      import('@fontsource/jetbrains-mono/latin-700.css'),
    ]),
  'Pixelify Sans': () =>
    Promise.all([
      import('@fontsource/pixelify-sans/cyrillic-400.css'),
      import('@fontsource/pixelify-sans/latin-400.css'),
      import('@fontsource/pixelify-sans/cyrillic-600.css'),
      import('@fontsource/pixelify-sans/latin-600.css'),
    ]),
  'Poiret One': () => Promise.all([import('@fontsource/poiret-one/cyrillic-400.css'), import('@fontsource/poiret-one/latin-400.css')]),
  Ponomar: () => Promise.all([import('@fontsource/ponomar/cyrillic-400.css'), import('@fontsource/ponomar/latin-400.css')]),
};

const requested = new Map<string, Promise<void>>();

/** Шрифт по имени семейства — один раз; неизвестное семейство или отказ сети оформление не ломают. */
export function ensureFont(family: string): Promise<void> {
  const have = requested.get(family);
  if (have) return have;
  const load = FONTS[family];
  if (!load) return Promise.resolve();
  const p = load().then(
    () => undefined,
    () => {
      requested.delete(family);
    },
  );
  requested.set(family, p);
  return p;
}

export function ensureFonts(families: readonly string[]): Promise<void> {
  return Promise.all(families.map(ensureFont)).then(() => undefined);
}

export const hasFont = (family: string): boolean => family in FONTS;
