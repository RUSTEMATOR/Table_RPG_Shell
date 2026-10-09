// Поиск мастера (этап 54). Только мастеру; в ответе — сниппет с отметками [[…]] вокруг найденного.

export const SEARCH_KINDS = ['diary', 'place', 'spot', 'rumor', 'note', 'letter', 'chapter', 'downtime', 'npc', 'character', 'moment'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];
export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  diary: 'Дневники и запросы',
  place: 'Места',
  spot: 'Места в городах',
  rumor: 'Слухи и сказы',
  note: 'Заметки сессий',
  letter: 'Письма',
  chapter: 'Летопись',
  downtime: 'Дела между сессиями',
  npc: 'Противники',
  character: 'Персонажи',
  moment: 'Памятные моменты',
};

export interface GmSearchHit {
  kind: SearchKind;
  ref: string;
  /** Куда перейти в интерфейсе мастера. */
  link: string;
  title: string;
  /** Отрывок; найденное — между «[[» и «]]». */
  snippet: string;
}
