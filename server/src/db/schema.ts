import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

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
