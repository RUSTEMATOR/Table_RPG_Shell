// Источники наборов украшений (каталог — docs/design-packs.md). Только свободные лицензии: CC0, общественное достояние,
// MIT; CC BY — с подписью. Адреса закреплены (коммит репозитория или конкретный файл), sha256 скачанного — в lock.json.
// Каждый источник: где взять (url | repo), что это (title), автор, лицензия, страница — для экрана «Авторы графики».

/** Файл Wikimedia Commons по имени: прямая ссылка и страница с лицензией. */
const wm = (name, author, licence = 'Общественное достояние') => ({
  url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}`,
  title: name.replace(/\.[a-z]+$/i, '').replace(/_/g, ' '),
  author,
  licence,
  page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name.replace(/ /g, '_'))}`,
});

/** Предмет Openclipart (CC0): SVG по id. */
const oc = (id, title, author) => ({
  url: `https://openclipart.org/download/${id}`,
  title,
  author,
  licence: 'CC0',
  page: `https://openclipart.org/detail/${id}`,
});

/** Материал ambientCG (CC0): архив 1K, внутри берётся цвет. */
const acg = (id) => ({
  url: `https://ambientcg.com/get?file=${id}_1K-JPG.zip`,
  zip: `${id}_1K-JPG_Color.jpg`,
  title: `${id}`,
  author: 'ambientCG',
  licence: 'CC0',
  page: `https://ambientcg.com/view?id=${id}`,
});

/** Текстура Poly Haven (CC0): цвет 1K. */
const ph = (id) => ({
  url: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}_diff_1k.jpg`,
  title: id,
  author: 'Poly Haven',
  licence: 'CC0',
  page: `https://polyhaven.com/a/${id}`,
});

/** Узор Hero Patterns (Steve Schoger, CC BY 4.0) из lowmess/hero-patterns (MIT) — SVG достаётся из JS-модуля. */
const hero = (name) => ({
  url: `https://raw.githubusercontent.com/lowmess/hero-patterns/4b5e56ece05b3069f8086240a07c76d02b6d67cb/src/patterns/${name}.js`,
  hero: true,
  title: `Hero Patterns — ${name}`,
  author: 'Steve Schoger',
  licence: 'CC BY 4.0',
  page: 'https://heropatterns.com',
});

const kenney = (slug, url, title) => ({ url, title, author: 'Kenney', licence: 'CC0', page: `https://kenney.nl/assets/${slug}` });

export const SOURCES = {
  // ---- репозитории ----
  va: {
    repo: 'https://github.com/WelshPixie/vintageart.git',
    sha: '5c8214b04a6adba795ab96067c1f7fda6d7c7cb8',
    title: 'Vintage Ornaments (журналы 1880–1910-х)',
    author: 'Screwy Lightbulb (WelshPixie)',
    licence: 'CC0',
    page: 'https://github.com/WelshPixie/vintageart',
  },

  // ---- Kenney (CC0) ----
  kFantasy: kenney('fantasy-ui-borders', 'https://kenney.nl/media/pages/assets/fantasy-ui-borders/ab29cd0165-1701602367/kenney_fantasy-ui-borders.zip', 'Fantasy UI Borders'),
  kSciFi: kenney('ui-pack-sci-fi', 'https://kenney.nl/media/pages/assets/ui-pack-sci-fi/b67c2acd31-1724181109/kenney_ui-pack-space-expansion.zip', 'UI Pack: Sci-Fi'),
  kAdventure: kenney('ui-pack-adventure', 'https://kenney.nl/media/pages/assets/ui-pack-adventure/9a877376bc-1723597274/kenney_ui-pack-adventure.zip', 'UI Pack: Adventure'),
  kPattern: kenney('pattern-pack', 'https://kenney.nl/media/pages/assets/pattern-pack/e787377a73-1721940715/kenney_pattern-pack.zip', 'Pattern Pack'),
  kPatternPx: kenney('pattern-pack-pixel', 'https://kenney.nl/media/pages/assets/pattern-pack-pixel/65c3f0f0a1-1721640064/kenney_pattern-pack-pixel.zip', 'Pattern Pack Pixel'),
  kPixelUi: kenney('pixel-ui-pack', 'https://kenney.nl/media/pages/assets/pixel-ui-pack/821e760f21-1677661508/kenney_pixel-ui-pack.zip', 'Pixel UI Pack'),
  kVoxel: kenney('voxel-pack', 'https://kenney.nl/media/pages/assets/voxel-pack/a3a73d0ff7-1677662501/kenney_voxel-pack.zip', 'Voxel Pack'),
  kCrosshair: kenney('crosshair-pack', 'https://kenney.nl/media/pages/assets/crosshair-pack/5ef74bd405-1785950072/kenney_crosshair-pack.zip', 'Crosshair Pack'),
  kParticle: kenney('particle-pack', 'https://kenney.nl/media/pages/assets/particle-pack/f8fe0f8cb8-1677578741/kenney_particle-pack.zip', 'Particle Pack'),

  // ---- OpenGameArt (CC0) ----
  spaceGui: {
    url: 'https://opengameart.org/sites/default/files/Space-Gui.zip',
    title: 'Simple hud gui construction kit in 8 colors',
    author: 'rawdanitsu',
    licence: 'CC0',
    page: 'https://opengameart.org/content/simple-hud-gui-constraction-kit-in-8-colors',
  },
  wxHolo: {
    url: 'https://opengameart.org/sites/default/files/1._free_hologram_interface_wenrexa.zip',
    title: 'Free UI Hologram Interface',
    author: 'Wenrexa',
    licence: 'CC0',
    page: 'https://opengameart.org/content/free-ui-hologram-interface',
  },
  wxSciFi: {
    url: 'https://opengameart.org/sites/default/files/wenrexaassetsui_scifi.zip',
    title: 'Assets: UI Minimalism SciFi',
    author: 'Wenrexa',
    licence: 'CC0',
    page: 'https://opengameart.org/content/assets-ui-minimalism-scifi',
  },
  wxWhite: {
    url: 'https://opengameart.org/sites/default/files/free_ui_kit_white_5.zip',
    title: 'Free UI KIT White interface #5',
    author: 'Wenrexa',
    licence: 'CC0',
    page: 'https://opengameart.org/content/free-ui-kit-white-interface-5',
  },
  fog: {
    url: 'https://opengameart.org/sites/default/files/fog01.png',
    title: 'Thick Fog',
    author: 'LFA',
    licence: 'CC0',
    page: 'https://opengameart.org/content/thick-fog',
  },
};

// Файлы Commons, Openclipart, ambientCG, Poly Haven и Hero Patterns добавляются по ходу (src: 'wm:…', 'oc:…', 'acg:…', 'ph:…', 'hero:…').
export const helpers = { wm, oc, acg, ph, hero };
