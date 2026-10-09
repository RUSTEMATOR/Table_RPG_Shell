import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

// Push-подписка (этап 41) = одно устройство участника. Внутренние данные сервера: наружу не уходят.
export const pushSubscription = sqliteTable(
  'push_subscription',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    label: text('label').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    lastOkAt: integer('last_ok_at'),
    fails: integer('fails').notNull().default(0),
  },
  (t) => [index('push_subscription_member_idx').on(t.memberId)],
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
    /** Противник выбран из библиотеки (имя и сила скопированы в строку сессии). */
    opponentNpcId: text('opponent_npc_id').references(() => npc.id, { onDelete: 'set null' }),
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

// Счётчик перегрузки зелёной магией. Только мастер; столу — лишь видимый признак по кнопке.
export const greenOverload = sqliteTable('green_overload', {
  characterId: text('character_id')
    .primaryKey()
    .references(() => character.id, { onDelete: 'cascade' }),
  value: integer('value').notNull().default(0),
  eyesAt: integer('eyes_at').notNull().default(3),
  skinAt: integer('skin_at').notNull().default(6),
  updatedAt: integer('updated_at').notNull(),
});

// Дневник игрока. private = только для себя: не отдаётся мастеру и не уходит в ИИ.
export const diaryEntry = sqliteTable(
  'diary_entry',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    characterId: text('character_id').references(() => character.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    private: integer('private', { mode: 'boolean' }).notNull().default(false),
    request: integer('request', { mode: 'boolean' }).notNull().default(false),
    requestState: text('request_state', { enum: ['open', 'answered'] }),
    reply: text('reply').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('diary_member_idx').on(t.memberId, t.createdAt), index('diary_room_idx').on(t.roomId, t.createdAt)],
);

// Письмо персонажу (этап 42). note_gm — только мастеру; игроку письмо видно только после доставки (delivered_at).
export const letter = sqliteTable(
  'letter',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => character.id, { onDelete: 'cascade' }),
    fromName: text('from_name').notNull(),
    text: text('text').notNull(),
    noteGm: text('note_gm').notNull().default(''),
    deliverAt: integer('deliver_at').notNull(),
    deliveredAt: integer('delivered_at'),
    readAt: integer('read_at'),
    reply: text('reply').notNull().default(''),
    repliedAt: integer('replied_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('letter_room_char_idx').on(t.roomId, t.characterId), index('letter_due_idx').on(t.deliveredAt, t.deliverAt)],
);

// Летопись (этап 43): глава по сессии. Черновик игроки не видят; quiz — JSON вопросов с верными ответами (игроку — без них).
export const chapter = sqliteTable(
  'chapter',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => gameSession.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    text: text('text').notNull(),
    quiz: text('quiz'),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    publishedAt: integer('published_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('chapter_room_idx').on(t.roomId, t.publishedAt)],
);

// Ответ игрока на викторину главы: один на участника.
export const chapterAnswer = sqliteTable(
  'chapter_answer',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapter.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    answers: text('answers').notNull(),
    score: integer('score').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('chapter_answer_once_idx').on(t.chapterId, t.memberId)],
);

// Дело между сессиями (этап 44): одно на персонажа на сессию. outcome — итог мастера, игроку после resolved_at.
export const downtime = sqliteTable(
  'downtime',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => gameSession.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => character.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    text: text('text').notNull().default(''),
    outcome: text('outcome'),
    resolvedAt: integer('resolved_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('downtime_once_idx').on(t.sessionId, t.characterId), index('downtime_room_idx').on(t.roomId, t.resolvedAt)],
);

// Заметки мастера к сессии.
export const sessionNote = sqliteTable('session_note', {
  sessionId: text('session_id')
    .primaryKey()
    .references(() => gameSession.id, { onDelete: 'cascade' }),
  text: text('text').notNull().default(''),
  updatedAt: integer('updated_at').notNull(),
});

// Сырые ответы Jev: для настройки порогов. Мастерские данные.
export const aiJudgment = sqliteTable(
  'ai_judgment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    subjectRef: text('subject_ref').notNull(),
    model: text('model').notNull(),
    answers: text('answers').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('ai_judgment_subject_idx').on(t.kind, t.subjectRef)],
);

// Сцена для общего экрана. textGm — только мастеру.
export const scene = sqliteTable(
  'scene',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    textPublic: text('text_public').notNull().default(''),
    textGm: text('text_gm').notNull().default(''),
    imageFile: text('image_file'),
    imageW: integer('image_w'),
    imageH: integer('image_h'),
    imageBytes: integer('image_bytes'),
    /** thumbhash превью (этап 40), base64; null — ещё не посчитан. */
    imageHash: text('image_hash'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('scene_room_idx').on(t.roomId)],
);

// Что сейчас на общем экране комнаты.
export const tableState = sqliteTable('table_state', {
  roomId: text('room_id')
    .primaryKey()
    .references(() => room.id, { onDelete: 'cascade' }),
  sceneId: text('scene_id').references(() => scene.id, { onDelete: 'set null' }),
  /** Противник, чей портрет сейчас на столе. */
  npcId: text('npc_id').references(() => npc.id, { onDelete: 'set null' }),
  /** Карта на столе (вместо сцены) и куда навести камеру: JSON {x, y, zoom} или null — вся карта. */
  mapId: text('map_id'),
  mapFocus: text('map_focus'),
  updatedAt: integer('updated_at').notNull(),
});

// Библиотека противников и NPC. Целиком мастерские данные; столу — только имя и портрет по кнопке.
export const npc = sqliteTable(
  'npc',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default(''),
    power: integer('power'),
    notesGm: text('notes_gm').notNull().default(''),
    imageFile: text('image_file'),
    imageW: integer('image_w'),
    imageH: integer('image_h'),
    imageBytes: integer('image_bytes'),
    /** thumbhash превью (этап 40), base64; null — ещё не посчитан. */
    imageHash: text('image_hash'),
    /** Пиксель-арт фигурка (этап 23), JSON по FigureSchema. Внешность — может уйти на стол и игрокам (карта, бой). */
    figure: text('figure'),
    /** 3D-модель на 3D-карте (этап 34): id из UNIT_IDS, null — фигурка как обычно. Внешность, как и фигурка. */
    model3d: text('model3d'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('npc_room_idx').on(t.roomId)],
);

// Лист персонажа: снаряжение, состояния, связи. text_gm — только мастеру; невидимые записи игроку не уходят вовсе.
export const sheetEntry = sqliteTable(
  'sheet_entry',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => character.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['item', 'condition', 'relation'] }).notNull(),
    title: text('title').notNull().default(''),
    text: text('text').notNull().default(''),
    textGm: text('text_gm').notNull().default(''),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
    updatedBy: text('updated_by', { enum: ['gm', 'player'] }).notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('sheet_entry_character_idx').on(t.characterId)],
);

// ---- Карты мира (этап 21) ----
// Контуры, имена и подписи регионов — из server/src/maps/json (не меняются); здесь — что открыто и заметки мастера.
// note_gm — только мастеру. Скрытые регионы и места игроку и столу не уходят вовсе.
export const mapRegion = sqliteTable(
  'map_region',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    mapId: text('map_id').notNull(),
    key: text('key').notNull(),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(false),
    noteGm: text('note_gm').notNull().default(''),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('map_region_key_idx').on(t.roomId, t.mapId, t.key)],
);

// Места на карте. key — у загруженных из json (повторная загрузка их не дублирует), у добавленных мастером — null.
export const mapPlace = sqliteTable(
  'map_place',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    mapId: text('map_id').notNull(),
    key: text('key'),
    name: text('name').notNull().default(''),
    kind: text('kind').notNull(),
    x: real('x').notNull(),
    y: real('y').notNull(),
    side: text('side', { enum: ['l', 'r', 'b'] })
      .notNull()
      .default('r'),
    subtitle: text('subtitle').notNull().default(''),
    ink: text('ink'),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(false),
    noteGm: text('note_gm').notNull().default(''),
    // карточка места (этап 27): видят игроки и стол, когда место открыто
    description: text('description').notNull().default(''),
    ruler: text('ruler').notNull().default(''),
    faction: text('faction').notNull().default(''),
    population: text('population').notNull().default(''),
    imageFile: text('image_file'),
    imageW: integer('image_w'),
    imageH: integer('image_h'),
    imageBytes: integer('image_bytes'),
    /** thumbhash превью (этап 40), base64; null — ещё не посчитан. */
    imageHash: text('image_hash'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('map_place_map_idx').on(t.roomId, t.mapId), uniqueIndex('map_place_key_idx').on(t.roomId, t.mapId, t.key)],
);

// ---- Города (этап 27) ----
// Места внутри города: таверна, рынок, замок… Игроку и столу — только видимые, note_gm — только мастеру.
export const mapSpot = sqliteTable(
  'map_spot',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    placeId: text('place_id')
      .notNull()
      .references(() => mapPlace.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull().default(''),
    description: text('description').notNull().default(''),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
    noteGm: text('note_gm').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('map_spot_place_idx').on(t.placeId)],
);

// Слухи и задания города. Мастер открывает по одному: revealed_at — порядок у игроков (сами времена не уходят).
export const mapRumor = sqliteTable(
  'map_rumor',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    placeId: text('place_id')
      .notNull()
      .references(() => mapPlace.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['rumor', 'quest'] }).notNull(),
    text: text('text').notNull().default(''),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(false),
    revealedAt: integer('revealed_at'),
    noteGm: text('note_gm').notNull().default(''),
    /** Открыть по расписанию (этап 45): планировщик откроет в это время. */
    revealAt: integer('reveal_at'),
    /** Сказ игрока (этап 45): автор; proposed — ждёт решения мастера, игрокам не виден. */
    authorMemberId: text('author_member_id').references(() => member.id, { onDelete: 'set null' }),
    proposed: integer('proposed', { mode: 'boolean' }).notNull().default(false),
    /** Кто первым открыл «Слухи» с этим слухом. */
    firstHeardBy: text('first_heard_by').references(() => member.id, { onDelete: 'set null' }),
    firstHeardAt: integer('first_heard_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('map_rumor_place_idx').on(t.placeId), index('map_rumor_due_idx').on(t.visible, t.revealAt)],
);

// Кто здесь: противник из библиотеки в городе (или в месте города). Игроку и столу — имя, фигурка и роль, без id противника.
export const mapPresence = sqliteTable(
  'map_presence',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    placeId: text('place_id')
      .notNull()
      .references(() => mapPlace.id, { onDelete: 'cascade' }),
    spotId: text('spot_id').references(() => mapSpot.id, { onDelete: 'set null' }),
    npcId: text('npc_id')
      .notNull()
      .references(() => npc.id, { onDelete: 'cascade' }),
    label: text('label').notNull().default(''),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('map_presence_place_idx').on(t.placeId), index('map_presence_npc_idx').on(t.npcId)],
);

// Маркер партии: один на комнату, на одной из карт.
export const mapParty = sqliteTable('map_party', {
  roomId: text('room_id')
    .primaryKey()
    .references(() => room.id, { onDelete: 'cascade' }),
  mapId: text('map_id').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
  /** Последний поход по дороге (этап 28), JSON {path, ms, seq}: клиенты проигрывают его как анимацию. */
  move: text('move'),
  updatedAt: integer('updated_at').notNull(),
});

// Отделившиеся отряды (этап 39): у каждого своя карта, точка, видимость и поход. Основной отряд — map_party.
export const mapGroup = sqliteTable(
  'map_group',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    mapId: text('map_id').notNull(),
    x: real('x').notNull(),
    y: real('y').notNull(),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
    move: text('move'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('map_group_room_idx').on(t.roomId)],
);

// Кто в отделившемся отряде. Персонажа здесь нет — он в основном отряде.
export const mapGroupMember = sqliteTable(
  'map_group_member',
  {
    characterId: text('character_id')
      .primaryKey()
      .references(() => character.id, { onDelete: 'cascade' }),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => mapGroup.id, { onDelete: 'cascade' }),
  },
  (t) => [index('map_group_member_group_idx').on(t.groupId)],
);

// Предложения игроков «идём туда» (этап 28). Видит мастер и сам предложивший; решает мастер.
export const mapProposal = sqliteTable(
  'map_proposal',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    mapId: text('map_id').notNull(),
    placeId: text('place_id')
      .notNull()
      .references(() => mapPlace.id, { onDelete: 'cascade' }),
    days: real('days').notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'declined'] }).notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('map_proposal_room_idx').on(t.roomId, t.mapId)],
);

// Фигурки на карте (этап 24): персонаж или противник из библиотеки (ровно одно из двух). Игрок и стол видят только visible.
// Персонаж — не больше одной фигурки на карте (проверяет сервер); противник — сколько угодно (стая волков).
export const mapToken = sqliteTable(
  'map_token',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    mapId: text('map_id').notNull(),
    characterId: text('character_id').references(() => character.id, { onDelete: 'cascade' }),
    npcId: text('npc_id').references(() => npc.id, { onDelete: 'cascade' }),
    x: real('x').notNull(),
    y: real('y').notNull(),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('map_token_map_idx').on(t.roomId, t.mapId)],
);

// Личные заметки игрока на карте. Видит только автор; мастеру и столу не уходят.
export const mapPlayerNote = sqliteTable(
  'map_player_note',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    mapId: text('map_id').notNull(),
    x: real('x').notNull(),
    y: real('y').notNull(),
    text: text('text').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('map_player_note_member_idx').on(t.memberId, t.mapId)],
);
