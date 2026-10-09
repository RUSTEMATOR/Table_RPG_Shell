import { z } from 'zod';

export const SyncHelloSchema = z.strictObject({
  /** Последний seq, который клиент видел, по каждой своей аудитории. */
  lastSeq: z.partialRecord(z.enum(['public', 'table', 'gm', 'member']), z.number().int().min(0)),
  buildId: z.string().max(100),
});
export type SyncHello = z.infer<typeof SyncHelloSchema>;

export interface SyncWelcome {
  buildId: string;
  reload: boolean;
  /** true — клиент отстал слишком сильно: заменить ленту целиком на events. */
  reset: boolean;
  events: FeedEvent[];
}

import type { GmAck, PlayerCharacter } from './character.ts';
import type { FeedEvent, RollGm, RollPublic } from './feed.ts';
import type { TableState } from './table.ts';
import type { MapId, OverloadSign } from './constants.ts';
import type { DiaryEntryPlayer, GmDiaryEntry, GmOverload, GreenSuggestion } from './gm.ts';
import type { GmPlayerPresence } from './presence.ts';
import type { LetterPlayer } from './letters.ts';
import type { ChapterPlayer } from './chronicle.ts';
import type { DowntimeStatePlayer } from './downtime.ts';
import type { SchedulePlayer } from './schedule.ts';
import type { TableMoment } from './moments.ts';

export interface ServerToClientEvents {
  'error:forbidden': (payload: { event: string }) => void;
  /** Игроку: его карточка изменилась (только проекция для игрока). */
  'character:updated': (payload: { character: PlayerCharacter | null }) => void;
  /** Мастеру: персонаж изменился, перечитать. */
  'gm:character.changed': (payload: { id: string }) => void;
  /** Новое событие ленты своей аудитории. */
  'feed:event': (payload: FeedEvent) => void;
  /** Мастеру: сменился противник сессии. */
  'gm:session.changed': () => void;
  /** Игроку: его дневник изменился (другое устройство, ответ мастера). */
  'diary:changed': (payload: { entry: DiaryEntryPlayer }) => void;
  'diary:removed': (payload: { id: string }) => void;
  /** Мастеру: запись дневника (не личная) появилась или изменилась. */
  'gm:diary.changed': (payload: { entry: GmDiaryEntry }) => void;
  'gm:diary.removed': (payload: { id: string }) => void;
  'gm:overload.changed': (payload: { overload: GmOverload }) => void;
  'gm:notes.changed': (payload: { sessionId: string; updatedAt: number }) => void;
  'gm:suggestion.green': (payload: GreenSuggestion) => void;
  /** Столу: видимый признак перегрузки персонажа (по кнопке мастера). */
  'table:sign': (payload: { character: string; sign: OverloadSign; at: number }) => void;
  /** Столу: памятный момент выдан (этап 47) — плашка на несколько секунд. */
  'table:moment': (payload: TableMoment) => void;
  /** Столу: сцена сменилась. */
  'table:state': (payload: TableState) => void;
  /** Игрокам и столу: открытая часть карты изменилась (уходит, только если она действительно изменилась). Перечитать. */
  'map:changed': (payload: { mapId: MapId }) => void;
  /** Игроку: его заметки на карте изменились (другое устройство). */
  'map:notes.changed': (payload: { mapId: MapId }) => void;
  /** Мастеру: карта изменилась, перечитать. */
  'gm:map.changed': (payload: { mapId: MapId }) => void;
  /** Игрокам и столу: открытая карточка места изменилась (только если действительно изменилась). Перечитать. */
  'map:place.changed': (payload: { mapId: MapId; placeId: string }) => void;
  /** Мастеру: карточка места изменилась (другое устройство). */
  'gm:place.changed': (payload: { placeId: string }) => void;
  /** Мастеру: новое предложение игрока «идём туда» или решение по нему (этап 28). */
  'gm:map.proposal': (payload: { mapId: MapId; who?: string; placeName?: string }) => void;
  /** Игроку: судьба его предложения изменилась. */
  'map:proposal.changed': (payload: { mapId: MapId }) => void;
  /** Мастеру: список сцен или показанная сцена изменились. */
  'gm:scenes.changed': () => void;
  /** Мастеру: библиотека противников изменилась. */
  'gm:npcs.changed': () => void;
  /** Мастеру: активность игрока изменилась (статус, вкладка, действие). */
  'gm:presence.changed': (payload: GmPlayerPresence) => void;
  /** Игроку: письмо доставлено или изменилось (этап 42). */
  'letters:changed': (payload: { letter: LetterPlayer }) => void;
  'letters:removed': (payload: { id: string }) => void;
  /** Мастеру: письма персонажа изменились (доставка, прочтение, ответ). */
  'gm:letters.changed': (payload: { characterId: string }) => void;
  /** Игроку: глава летописи опубликована или изменилась (этап 43). */
  'chronicle:changed': (payload: { chapter: ChapterPlayer }) => void;
  'chronicle:removed': (payload: { id: string }) => void;
  /** Мастеру: главы изменились (правка, публикация, ответ игрока). */
  'gm:chronicle.changed': (payload: { id: string }) => void;
  /** Игроку: его дело между сессиями изменилось или разобрано (этап 44). */
  'downtime:changed': (payload: DowntimeStatePlayer) => void;
  /** Мастеру: дела изменились. */
  'gm:downtime.changed': (payload: { id: string }) => void;
  /** Игроку: расписание изменилось (этап 46) — его проекция. */
  'schedule:changed': (payload: SchedulePlayer) => void;
  'gm:schedule.changed': () => void;
}

type Ack = (res: GmAck) => void;

export interface ClientToServerEvents {
  'sync:hello': (payload: SyncHello, ack: (welcome: SyncWelcome) => void) => void;
  'gm:trait.setReveal': (payload: unknown, ack: Ack) => void;
  'gm:trait.setStage': (payload: unknown, ack: Ack) => void;
  'gm:trait.setTier': (payload: unknown, ack: Ack) => void;
  'gm:trait.setFork': (payload: unknown, ack: Ack) => void;
  'roll:request': (payload: unknown, ack: (res: { ok: true; roll: RollPublic | RollGm } | { ok: false; error: string }) => void) => void;
  'gm:roll.override': (payload: unknown, ack: Ack) => void;
  /** Игрок: что открыто в приложении (PlayerActivitySchema). Без ответа, можно потерять. */
  'player:activity': (payload: unknown) => void;
}
