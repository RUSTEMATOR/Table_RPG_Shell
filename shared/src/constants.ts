// Постоянные, нужные клиенту в рантайме: подписи, списки значений. Без zod — чтобы импорт подписи
// не тянул на клиент библиотеку схем (схемы — в остальных модулях shared, они нужны серверу).

// ---- Броски ----
/** Исход d10 по таблице и эффект после поправки на разницу сил. */
export const EFFECTS = ['complication', 'fail', 'success', 'strong', 'crit', 'scratch', 'crit_damage', 'notable_damage', 'luck'] as const;
export type Effect = (typeof EFFECTS)[number];

export const EFFECT_LABELS: Record<Effect, string> = {
  complication: 'Провал с осложнением',
  fail: 'Провал',
  success: 'Успех',
  strong: 'Сильный успех',
  crit: 'Критический успех',
  scratch: 'Лишь царапина',
  crit_damage: 'Критический урон',
  notable_damage: 'Заметный урон',
  luck: 'Бросок удачи',
};

// ---- Перегрузка ----
export type OverloadSign = 'none' | 'eyes' | 'skin';
export const SIGN_TEXT: Record<OverloadSign, string> = {
  none: 'Зелени не видно',
  eyes: 'Глаза зеленеют',
  skin: 'Кожу покрывает изумруд',
};

// ---- Вход ----
export const PIN_LENGTH = 6;

// ---- Лист персонажа ----
export const SHEET_KINDS = ['item', 'condition', 'relation'] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];
export const SHEET_TITLES: Record<SheetKind, string> = { item: 'Снаряжение', condition: 'Состояния', relation: 'Связи' };

// ---- ИИ-сводки ----
export const SUMMARY_KINDS = ['gm', 'player', 'crossing'] as const;
export type SummaryKindKey = (typeof SUMMARY_KINDS)[number];
export const SUMMARY_TITLES: Record<SummaryKindKey, string> = {
  gm: 'Сводка для мастера',
  player: 'Вступление для игрока',
  crossing: 'Сцена перехода',
};

// ---- Карты ----
export const MAP_IDS = ['world', 'razdolye', 'frozen'] as const;
export type MapId = (typeof MAP_IDS)[number];
export const MAP_W = 1600;
export const MAP_H = 1100;
export const PLACE_KINDS = ['capital', 'city', 'town', 'bigtown', 'elven', 'college', 'village', 'camp', 'church', 'crypt', 'cult', 'vampire', 'lake', 'storm', 'mark'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];
export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  capital: 'Столица',
  city: 'Город',
  town: 'Поселение',
  bigtown: 'Крупный город',
  elven: 'Эльфийский город',
  college: 'Коллегия магов',
  village: 'Деревня',
  camp: 'Лагерь',
  church: 'Храм',
  crypt: 'Крипта',
  cult: 'Культ',
  vampire: 'Лагерь вампиров',
  lake: 'Озеро',
  storm: 'Буря',
  mark: 'Отметка',
};
