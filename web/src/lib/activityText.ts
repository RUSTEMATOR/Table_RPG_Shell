import { FIGURE_SLOT_LABELS, PLAYER_TAB_LABELS, type CitySection, type MapId, type PlayerAction, type PlayerTab, type PresenceStatus } from '@zg/shared';

// Подписи для вкладки мастера «Активность».

const MAP_TITLES: Record<MapId, string> = { world: 'Мир', razdolye: 'Раздолье', frozen: 'Замёрзшие земли' };
const CITY_SECTIONS: Record<CitySection, string> = { about: 'Обзор', spot: 'место в городе', rumors: 'Слухи и задания', here: 'Кто здесь' };

export const STATUS_LABELS: Record<PresenceStatus, string> = { online: 'в сети', hidden: 'свёрнуто', offline: 'не в сети' };

export function actionText(a: PlayerAction, placeName: string | null): string {
  switch (a.kind) {
    case 'roll':
      return `бросает ${a.die}`;
    case 'card.theme':
      return 'выбирает оформление';
    case 'card.item':
      return a.isNew ? 'добавляет вещь' : 'правит вещь';
    case 'figure.edit':
      return `часть «${FIGURE_SLOT_LABELS[a.slot]}»`;
    case 'diary.write':
      return 'пишет запись';
    case 'map.view':
      return MAP_TITLES[a.mapId];
    case 'map.note':
      return 'ставит заметку';
    case 'map.place':
      return `карточка «${placeName ?? 'место'}»`;
    case 'map.city':
      return `в городе «${placeName ?? 'город'}», ${CITY_SECTIONS[a.section]}`;
  }
}

/** «Карта — Раздолье», «Дневник — пишет запись», «Броски». */
export function whereText(tab: PlayerTab | null, action: PlayerAction | null, placeName: string | null): string | null {
  if (!tab) return null;
  return action ? `${PLAYER_TAB_LABELS[tab]} — ${actionText(action, placeName)}` : PLAYER_TAB_LABELS[tab];
}

/** Сколько прошло: «меньше минуты», «5 мин», «2 ч 10 мин», «3 дн». */
export function elapsed(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'меньше минуты';
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} ч ${min % 60} мин` : `${h} ч`;
  return `${Math.floor(h / 24)} дн`;
}
