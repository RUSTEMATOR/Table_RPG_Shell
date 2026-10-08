import { z } from 'zod';
import { MAP_IDS } from './constants.ts';
import { FIGURE_SLOTS } from './figure.ts';

// Активность игрока: что открыто в приложении. Только мастеру; набранный игроком текст сюда не попадает.

export const PLAYER_TABS = ['rolls', 'card', 'figure', 'diary', 'chronicle', 'map'] as const;
export type PlayerTab = (typeof PLAYER_TABS)[number];
export const PLAYER_TAB_LABELS: Record<PlayerTab, string> = { rolls: 'Броски', card: 'Карточка', figure: 'Фигурка', diary: 'Дневник', chronicle: 'Летопись', map: 'Карта' };

export const CITY_SECTIONS = ['about', 'spot', 'rumors', 'here'] as const;
export type CitySection = (typeof CITY_SECTIONS)[number];

const PlaceIdSchema = z.string().min(1).max(64);

/** Что игрок делает на вкладке. Параметры — только перечисления и id, никакого свободного текста. */
export const PlayerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('roll'), die: z.enum(['d10', 'd20']) }),
  z.strictObject({ kind: z.literal('card.theme') }),
  z.strictObject({ kind: z.literal('card.item'), isNew: z.boolean() }),
  z.strictObject({ kind: z.literal('figure.edit'), slot: z.enum(FIGURE_SLOTS) }),
  // Вид записи (дневник, вопрос, «Только мне») и «новая / правка» не передаются.
  z.strictObject({ kind: z.literal('diary.write') }),
  z.strictObject({ kind: z.literal('map.view'), mapId: z.enum(MAP_IDS) }),
  z.strictObject({ kind: z.literal('map.note') }),
  z.strictObject({ kind: z.literal('map.place'), placeId: PlaceIdSchema }),
  z.strictObject({ kind: z.literal('map.city'), placeId: PlaceIdSchema, section: z.enum(CITY_SECTIONS) }),
]);
export type PlayerAction = z.infer<typeof PlayerActionSchema>;

export const PlayerActivitySchema = z.strictObject({
  tab: z.enum(PLAYER_TABS).nullable(),
  /** Страница на экране (не свёрнута). */
  visible: z.boolean(),
  action: PlayerActionSchema.nullable(),
});
export type PlayerActivity = z.infer<typeof PlayerActivitySchema>;

export type PresenceStatus = 'online' | 'hidden' | 'offline';

export interface GmPresenceLogEntry {
  at: number;
  status: PresenceStatus;
  tab: PlayerTab | null;
  action: PlayerAction | null;
  /** Название места для map.place / map.city. */
  placeName: string | null;
}

export interface GmPlayerPresence {
  memberId: string;
  memberName: string;
  characterId: string | null;
  characterName: string | null;
  status: PresenceStatus;
  tab: PlayerTab | null;
  action: PlayerAction | null;
  placeName: string | null;
  /** С какого момента нынешние статус, вкладка и действие. */
  since: number | null;
  /** Последняя связь: сейчас для «в сети», иначе — когда пропал. */
  lastSeenAt: number | null;
  devices: number;
  /** Новые сначала, не больше 30. */
  log: GmPresenceLogEntry[];
}
