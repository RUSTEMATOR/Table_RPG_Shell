import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const room = sqliteTable('room', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const member = sqliteTable(
  'member',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['gm', 'player', 'table'] }).notNull(),
    name: text('name').notNull(),
    // PIN игрока или пароль мастера, argon2id. У стола секрета нет.
    secretHash: text('secret_hash'),
    inviteTokenHash: text('invite_token_hash').unique(),
    inviteExpiresAt: integer('invite_expires_at'),
    inviteUsedAt: integer('invite_used_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('member_room_idx').on(t.roomId)],
);

export const authSession = sqliteTable(
  'auth_session',
  {
    // sha256 от токена из cookie; сам токен не хранится.
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
  },
  (t) => [index('auth_session_member_idx').on(t.memberId)],
);

// Персонаж: здесь только то, что нужно для списков и привязки к игроку.
export const character = sqliteTable(
  'character',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    ownerMemberId: text('owner_member_id').references(() => member.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: ['popadanets', 'local'] }).notNull(),
    name: text('name').notNull(),
    // Текст для игрока у местного персонажа (у попаданца карточку собирает projectForPlayer).
    publicBio: text('public_bio').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('character_room_idx').on(t.roomId), index('character_owner_idx').on(t.ownerMemberId)],
);

// Мастерские данные персонажа: документ Char рандомизатора целиком (черты, ступени, раскрытие,
// заметки, «под персонажа», сводки). Игроку — только через visibility/character.ts.
export const characterSecret = sqliteTable('character_secret', {
  characterId: text('character_id')
    .primaryKey()
    .references(() => character.id, { onDelete: 'cascade' }),
  doc: text('doc').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// Игровая сессия: группирует броски, хранит текущего противника (только для мастера).
export const gameSession = sqliteTable(
  'game_session',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    opponentName: text('opponent_name').notNull().default(''),
    opponentPower: integer('opponent_power'),
  },
  (t) => [index('game_session_room_idx').on(t.roomId)],
);

export const roll = sqliteTable(
  'roll',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => gameSession.id, { onDelete: 'set null' }),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    characterId: text('character_id').references(() => character.id, { onDelete: 'set null' }),
    characterName: text('character_name'),
    kind: text('kind', { enum: ['d10', 'd20'] }).notNull(),
    value: integer('value').notNull(),
    visibility: text('visibility', { enum: ['public', 'gm_and_me', 'gm_hidden'] }).notNull(),
    label: text('label').notNull().default(''),
    outcome: text('outcome').notNull(),
    effect: text('effect').notNull(),
    ruleText: text('rule_text').notNull().default(''),
    myPower: integer('my_power').notNull(),
    enemyName: text('enemy_name'),
    enemyPower: integer('enemy_power'),
    corrected: integer('corrected', { mode: 'boolean' }).notNull().default(false),
    correctionNote: text('correction_note'),
    clientRequestId: text('client_request_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('roll_dedupe_idx').on(t.memberId, t.clientRequestId), index('roll_room_idx').on(t.roomId, t.createdAt)],
);

// Лента: одна строка на аудиторию. seq свой у каждой (room, audience), поэтому
// у игрока нет пропусков от скрытых событий. payload — уже спроецированный DTO этой аудитории.
export const event = sqliteTable(
  'event',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    audience: text('audience').notNull(),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    payload: text('payload').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('event_audience_seq_idx').on(t.roomId, t.audience, t.seq)],
);
