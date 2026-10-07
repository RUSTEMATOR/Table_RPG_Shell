import type { CreatureId, FigureSlot, HumanFigure } from '@zg/shared';
import raw from './catalog.json';
import palettesRaw from './palettes.json';
import creaturesRaw from './creatures.json';

// Каталог деталей LPC (tools/extract-lpc): слоты, детали, слои, анимации, способ окраски.

export type BodyType = 'male' | 'female';
export type Anim = 'idle' | 'walk' | 'slash' | 'thrust' | 'spellcast' | 'shoot' | 'hurt';
export type Layer = { z: number; paths: Partial<Record<BodyType, string>>; anims: Anim[]; oversize?: true; fixed?: string };
export type Colors = { kind: 'palette'; material: Material; base: string } | { kind: 'variants'; list: string[] } | null;
export type Item = { id: string; label: string; bodies: BodyType[]; colors: Colors; layers: Layer[]; attack?: Anim };
export type Material = 'body' | 'hair' | 'cloth' | 'metal';

export const catalog = raw as unknown as { sha: string; anims: Anim[]; bodies: BodyType[]; slots: Partial<Record<FigureSlot, Item[]>> };
export const palettes = palettesRaw as unknown as Record<Material, Record<string, string[]>>;

export const SLOT_LABELS: Record<FigureSlot, string> = {
  body: 'Тело',
  head: 'Лицо',
  hair: 'Волосы',
  beard: 'Борода',
  torso: 'Одежда',
  armour: 'Броня',
  cape: 'Плащ',
  legs: 'Ноги',
  feet: 'Обувь',
  headwear: 'На голове',
  weapon: 'Оружие',
};
/** Слоты, которые можно оставить пустыми (у тела и лица всегда что-то выбрано). */
export const OPTIONAL: FigureSlot[] = ['hair', 'beard', 'torso', 'armour', 'cape', 'legs', 'feet', 'headwear', 'weapon'];

/** Существо (этап 33, tools/extract-lpc/creatures.mjs): кадр px, номера столбцов по анимациям; ranged — бьёт издали. */
export type CreatureFrames = Record<'idle' | 'walk' | 'attack' | 'hurt', number[]>;
export type Creature = { id: CreatureId; label: string; cell: number; frames: CreatureFrames; ranged?: true; fps?: Partial<Record<keyof CreatureFrames, number>> };
const creatures = creaturesRaw as unknown as { v: string; creatures: Creature[]; credits: { name: string; licenses: string[]; urls: string[] }[] };
export const CREATURES = creatures.creatures;
export const CREATURE_V = creatures.v;
export const CREATURE_CREDITS = creatures.credits;
export const creature = (id: CreatureId): Creature | undefined => CREATURES.find((c) => c.id === id);

export function item(slot: FigureSlot, id: string | undefined): Item | undefined {
  return id ? catalog.slots[slot]?.find((i) => i.id === id) : undefined;
}

/** Подписи цветов палитр. Остальные ключи палитр LPC показываются как есть. */
export const COLOR_LABELS: Record<string, string> = {
  light: 'Светлая',
  amber: 'Янтарная',
  olive: 'Оливковая',
  taupe: 'Смуглая',
  bronze: 'Бронзовая',
  brown: 'Коричневая',
  black: 'Тёмная',
  green: 'Зелёная',
  pale_green: 'Бледно-зелёная',
  dark_green: 'Тёмно-зелёная',
  blue: 'Синяя',
  lavender: 'Лавандовая',
  zombie: 'Зомби',
  fur_brown: 'Бурая шерсть',
  fur_grey: 'Серая шерсть',
  fur_black: 'Чёрная шерсть',
  fur_white: 'Белая шерсть',
  fur_tan: 'Рыжая шерсть',
  orange: 'Рыжие',
  ginger: 'Медные',
  red: 'Красные',
  blonde: 'Светлые',
  gold: 'Золотистые',
  platinum: 'Платиновые',
  white: 'Белые',
  gray: 'Седые',
  ash: 'Пепельные',
  light_brown: 'Русые',
  chestnut: 'Каштановые',
  dark_brown: 'Тёмно-каштановые',
  raven: 'Чёрные',
  purple: 'Фиолетовые',
  rose: 'Розовые',
  navy: 'Тёмно-синие',
  forest: 'Лесная',
  leather: 'Кожа',
  walnut: 'Орех',
  maroon: 'Бордовая',
  teal: 'Бирюзовая',
  slate: 'Сланцевая',
  charcoal: 'Угольная',
  tan: 'Песочная',
  sky: 'Небесная',
  bluegray: 'Серо-синяя',
  yellow: 'Жёлтая',
  pink: 'Розовая',
  steel: 'Сталь',
  iron: 'Железо',
  silver: 'Серебро',
  brass: 'Латунь',
  copper: 'Медь',
  ceramic: 'Керамика',
  medium: 'Обычный',
  dark: 'Тёмный',
};

/** Цвета на выбор у детали: ключи палитры материала или файлы-варианты. Скин — у тела и лица: палитра тела. */
export function colorChoices(slot: FigureSlot, it: Item | undefined): string[] {
  if (!it?.colors) return [];
  if (it.colors.kind === 'variants') return it.colors.list.length > 1 ? it.colors.list : [];
  if (it.colors.material === 'body') return [];
  return Object.keys(palettes[it.colors.material] ?? {});
}
export const SKINS = [
  'light',
  'amber',
  'olive',
  'taupe',
  'bronze',
  'brown',
  'black',
  'green',
  'pale_green',
  'dark_green',
  'blue',
  'lavender',
  'zombie',
  'fur_brown',
  'fur_grey',
  'fur_black',
  'fur_white',
];

export const DEFAULT_FIGURE: HumanFigure = {
  v: 1,
  body: 'female',
  skin: 'light',
  parts: {
    body: { id: 'human' },
    head: { id: 'human_female' },
    hair: { id: 'long', color: 'dark_brown' },
    torso: { id: 'longsleeve', color: 'forest' },
    legs: { id: 'pants', color: 'brown' },
    feet: { id: 'boots', color: 'leather' },
  },
};

/** Случайная фигурка человека: для «Случайно» в конструкторе. */
export function randomFigure(rnd: () => number = Math.random): HumanFigure {
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
  const body: BodyType = rnd() < 0.5 ? 'male' : 'female';
  const human = (s: FigureSlot) => (catalog.slots[s] ?? []).filter((i) => i.bodies.includes(body));
  const part = (s: FigureSlot, chance = 1) => {
    if (rnd() > chance) return undefined;
    const it = pick(human(s));
    if (!it) return undefined;
    const colors = colorChoices(s, it);
    return { id: it.id, ...(colors.length ? { color: pick(colors) } : {}) };
  };
  return {
    v: 1,
    body,
    skin: pick(['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black']),
    parts: {
      body: { id: 'human' },
      head: { id: body === 'male' ? 'human_male' : 'human_female' },
      hair: part('hair', 0.9),
      beard: body === 'male' ? part('beard', 0.4) : undefined,
      torso: part('torso'),
      armour: part('armour', 0.35),
      cape: part('cape', 0.2),
      legs: part('legs'),
      feet: part('feet', 0.9),
      headwear: part('headwear', 0.2),
      weapon: part('weapon', 0.8),
    },
  };
}
