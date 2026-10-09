import { and, asc, desc, eq, isNotNull, lte } from 'drizzle-orm';
import {
  MapIdSchema,
  PLACE_KIND_LABELS,
  PlaceKindSchema,
  RUMOR_KINDS,
  RumorKindSchema,
  SPOT_KINDS,
  SPOT_KIND_LABELS,
  SpotKindSchema,
  type GmPlaceDetail,
  type MapId,
  type PlaceDraft,
  type RumorKind,
  type SpotKind,
} from '@zg/shared';
import { z } from 'zod';
import { newId } from '../auth/tokens.ts';
import { claudeConfigured } from '../ai/claude/client.ts';
import { db, schema } from '../db/client.ts';
import { SUMMARY_LORE } from './data.ts';
import { MAPS, type PlaceRow } from './maps.ts';
import { NO_IMAGE, imagePublic, removeImage, storeImage } from './media.ts';
import { listNpcs, npcFigure } from './npc.ts';
import { pushToGm, pushToMember, pushToPlayers } from '../push/send.ts';

// Города (этап 27): карточка места, места в городе, слухи и задания, «кто здесь». Здесь — данные и правка мастера;
// что видят игрок и стол — только visibility/map.ts (projectPlaceDetail).

export type SpotRow = typeof schema.mapSpot.$inferSelect;
export type RumorRow = typeof schema.mapRumor.$inferSelect;
export type PresenceRow = typeof schema.mapPresence.$inferSelect;

export function spotRows(placeId: string): SpotRow[] {
  return db.select().from(schema.mapSpot).where(eq(schema.mapSpot.placeId, placeId)).orderBy(asc(schema.mapSpot.sort), asc(schema.mapSpot.createdAt)).all();
}

export function rumorRows(placeId: string): RumorRow[] {
  return db.select().from(schema.mapRumor).where(eq(schema.mapRumor.placeId, placeId)).orderBy(asc(schema.mapRumor.createdAt)).all();
}

/** «Кто здесь» вместе с именем и фигуркой противника (вживую из библиотеки). */
export function presenceRows(placeId: string) {
  return db
    .select({ p: schema.mapPresence, name: schema.npc.name, figure: schema.npc.figure })
    .from(schema.mapPresence)
    .innerJoin(schema.npc, eq(schema.npc.id, schema.mapPresence.npcId))
    .where(eq(schema.mapPresence.placeId, placeId))
    .orderBy(asc(schema.mapPresence.createdAt))
    .all();
}

/** Места, где стоит этот противник (чтобы сообщить о смене его имени или внешности). */
export function placesWithNpc(roomId: string, npcId: string): string[] {
  const rows = db
    .select({ placeId: schema.mapPresence.placeId })
    .from(schema.mapPresence)
    .where(and(eq(schema.mapPresence.roomId, roomId), eq(schema.mapPresence.npcId, npcId)))
    .all();
  return [...new Set(rows.map((r) => r.placeId))];
}

// Черновики Claude доступны и в демо-комнате (решение Рустема, 2026-10-09): гостю важно увидеть, как это работает.
export const draftsAvailable = (_roomId: string) => claudeConfigured();

export function gmPlaceDetail(roomId: string, p: PlaceRow): GmPlaceDetail {
  const names = memberNames(roomId);
  return {
    id: p.id,
    mapId: MapIdSchema.parse(p.mapId),
    name: p.name,
    kind: PlaceKindSchema.catch('mark').parse(p.kind),
    subtitle: p.subtitle,
    visible: p.visible,
    description: p.description,
    ruler: p.ruler,
    faction: p.faction,
    population: p.population,
    noteGm: p.noteGm,
    image: imagePublic(p),
    spots: spotRows(p.id).map((s) => ({
      id: s.id,
      kind: SpotKindSchema.catch('other').parse(s.kind),
      name: s.name,
      description: s.description,
      visible: s.visible,
      noteGm: s.noteGm,
      sort: s.sort,
    })),
    rumors: rumorRows(p.id).map((r) => ({
      id: r.id,
      kind: RumorKindSchema.catch('rumor').parse(r.kind),
      text: r.text,
      visible: r.visible,
      revealedAt: r.revealedAt,
      noteGm: r.noteGm,
      revealAt: r.revealAt,
      author: r.authorMemberId ? (names.get(r.authorMemberId) ?? null) : null,
      proposed: r.proposed,
      firstBy: r.firstHeardBy ? (names.get(r.firstHeardBy) ?? null) : null,
    })),
    presence: presenceRows(p.id).map(({ p: x, name, figure }) => ({
      id: x.id,
      npcId: x.npcId,
      name,
      figure: npcFigure({ figure }),
      spotId: x.spotId,
      label: x.label,
      visible: x.visible,
    })),
    npcs: listNpcs(roomId).map((n) => ({ id: n.id, name: n.name })),
    drafts: draftsAvailable(roomId),
  };
}

// ---- правка ----

export function getSpot(roomId: string, id: string): SpotRow | undefined {
  return db
    .select()
    .from(schema.mapSpot)
    .where(and(eq(schema.mapSpot.roomId, roomId), eq(schema.mapSpot.id, id)))
    .get();
}
export function getRumor(roomId: string, id: string): RumorRow | undefined {
  return db
    .select()
    .from(schema.mapRumor)
    .where(and(eq(schema.mapRumor.roomId, roomId), eq(schema.mapRumor.id, id)))
    .get();
}
export function getPresence(roomId: string, id: string): PresenceRow | undefined {
  return db
    .select()
    .from(schema.mapPresence)
    .where(and(eq(schema.mapPresence.roomId, roomId), eq(schema.mapPresence.id, id)))
    .get();
}

export function createSpot(p: PlaceRow, w: { kind: SpotKind; name: string; description: string; visible: boolean; noteGm: string; sort?: number }): SpotRow {
  const now = Date.now();
  const sort = w.sort ?? spotRows(p.id).reduce((m, s) => Math.max(m, s.sort + 1), 0);
  const row: SpotRow = {
    id: newId(),
    roomId: p.roomId,
    placeId: p.id,
    kind: w.kind,
    name: w.name,
    description: w.description,
    visible: w.visible,
    noteGm: w.noteGm,
    sort,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.mapSpot).values(row).run();
  return row;
}
export function updateSpot(s: SpotRow, patch: Partial<Pick<SpotRow, 'kind' | 'name' | 'description' | 'visible' | 'noteGm' | 'sort'>>): void {
  db.update(schema.mapSpot)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(schema.mapSpot.id, s.id))
    .run();
}
export function deleteSpot(s: SpotRow): void {
  db.delete(schema.mapSpot).where(eq(schema.mapSpot.id, s.id)).run();
}

export function createRumor(p: PlaceRow, w: { kind: RumorKind; text: string; visible: boolean; noteGm: string }): RumorRow {
  const now = Date.now();
  const row: RumorRow = {
    id: newId(),
    roomId: p.roomId,
    placeId: p.id,
    kind: w.kind,
    text: w.text,
    visible: w.visible,
    revealedAt: w.visible ? now : null,
    noteGm: w.noteGm,
    revealAt: null,
    authorMemberId: null,
    proposed: false,
    firstHeardBy: null,
    firstHeardAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.mapRumor).values(row).run();
  if (w.visible) pushRumorRevealed(p, w.kind);
  return row;
}
/** Открытие слуха ставит его в конец списка у игроков; закрытие убирает отметку (открыть снова — снова в конец). */
export function updateRumor(r: RumorRow, patch: { kind?: RumorKind; text?: string; visible?: boolean; noteGm?: string; revealAt?: number | null }): void {
  const now = Date.now();
  const revealed = patch.visible === undefined || patch.visible === r.visible ? {} : { revealedAt: patch.visible ? now : null };
  // открыли руками — расписание больше не нужно
  const schedule = patch.visible ? { revealAt: null } : {};
  db.update(schema.mapRumor)
    .set({ ...patch, ...revealed, ...schedule, updatedAt: now })
    .where(eq(schema.mapRumor.id, r.id))
    .run();
  if (patch.visible && !r.visible) {
    const p = db.select().from(schema.mapPlace).where(eq(schema.mapPlace.id, r.placeId)).get();
    if (p) pushRumorRevealed(p, patch.kind ?? RumorKindSchema.catch('rumor').parse(r.kind));
  }
}

// ---- этап 45: имена, расписание, «первым услышал», сказы ----

/** Участник → имя его персонажа, иначе имя участника. Для подписей «рассказал», «первым услышал». */
export function memberNames(roomId: string): Map<string, string> {
  const names = new Map(
    db
      .select({ id: schema.member.id, name: schema.member.name })
      .from(schema.member)
      .where(eq(schema.member.roomId, roomId))
      .all()
      .map((m) => [m.id, m.name]),
  );
  for (const c of db.select({ owner: schema.character.ownerMemberId, name: schema.character.name }).from(schema.character).where(eq(schema.character.roomId, roomId)).all())
    if (c.owner) names.set(c.owner, c.name);
  return names;
}

/** Слух или задание стало открытым в открытом месте — push игрокам (этап 41): только вид и имя места, без текста. */
export function pushRumorRevealed(p: PlaceRow, kind: RumorKind): void {
  if (!p.visible || p.kind === 'deleted') return;
  pushToPlayers(p.roomId, { title: p.name, body: kind === 'quest' ? 'Новое задание' : 'Новый слух', url: '/?tab=map', tag: `rumor:${p.id}` });
}

/** Слухи, чьё время настало, — открыть. Возвращает места, где что-то открылось (для сигналов). */
export function revealDueRumors(now = Date.now()): PlaceRow[] {
  const due = db
    .select()
    .from(schema.mapRumor)
    .where(and(eq(schema.mapRumor.visible, false), eq(schema.mapRumor.proposed, false), isNotNull(schema.mapRumor.revealAt), lte(schema.mapRumor.revealAt, now)))
    .all();
  const places: PlaceRow[] = [];
  for (const r of due) {
    db.update(schema.mapRumor).set({ visible: true, revealedAt: now, revealAt: null, updatedAt: now }).where(eq(schema.mapRumor.id, r.id)).run();
    const p = db.select().from(schema.mapPlace).where(eq(schema.mapPlace.id, r.placeId)).get();
    if (!p) continue;
    pushRumorRevealed(p, RumorKindSchema.catch('rumor').parse(r.kind));
    if (!places.some((x) => x.id === p.id)) places.push(p);
  }
  return places;
}

/** Игрок открыл «Слухи» с этим слухом: первый — запоминается. true — что-то изменилось. */
export function markHeard(r: RumorRow, memberId: string): boolean {
  if (!r.visible || r.proposed || r.firstHeardBy) return false;
  const now = Date.now();
  db.update(schema.mapRumor).set({ firstHeardBy: memberId, firstHeardAt: now, updatedAt: now }).where(eq(schema.mapRumor.id, r.id)).run();
  return true;
}

/** Сказ игрока: ждёт мастера, игрокам не виден. */
export function createTale(p: PlaceRow, memberId: string, text: string): RumorRow {
  const now = Date.now();
  const row: RumorRow = {
    id: newId(),
    roomId: p.roomId,
    placeId: p.id,
    kind: 'rumor',
    text,
    visible: false,
    revealedAt: null,
    noteGm: '',
    revealAt: null,
    authorMemberId: memberId,
    proposed: true,
    firstHeardBy: null,
    firstHeardAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.mapRumor).values(row).run();
  const who = memberNames(p.roomId).get(memberId) ?? 'игрок';
  pushToGm(p.roomId, { title: 'Сказ игрока', body: `${who} — ${p.name}`, url: '/gm/maps', tag: `tale:${row.id}` });
  return row;
}

export function listOwnTales(roomId: string, placeId: string, memberId: string): RumorRow[] {
  return db
    .select()
    .from(schema.mapRumor)
    .where(and(eq(schema.mapRumor.roomId, roomId), eq(schema.mapRumor.placeId, placeId), eq(schema.mapRumor.authorMemberId, memberId)))
    .orderBy(desc(schema.mapRumor.createdAt))
    .all();
}

/** Мастер принял сказ: открытый слух с подписью автора. */
export function acceptTale(r: RumorRow): void {
  const now = Date.now();
  db.update(schema.mapRumor).set({ proposed: false, visible: true, revealedAt: now, revealAt: null, updatedAt: now }).where(eq(schema.mapRumor.id, r.id)).run();
  const p = db.select().from(schema.mapPlace).where(eq(schema.mapPlace.id, r.placeId)).get();
  if (p) pushRumorRevealed(p, 'rumor');
  if (r.authorMemberId) pushToMember(r.roomId, r.authorMemberId, { title: 'Сказ принят', body: p?.name ?? '', url: '/?tab=map', tag: `tale:${r.id}` });
}

export function declineTale(r: RumorRow): void {
  db.delete(schema.mapRumor).where(eq(schema.mapRumor.id, r.id)).run();
  const p = db.select({ name: schema.mapPlace.name }).from(schema.mapPlace).where(eq(schema.mapPlace.id, r.placeId)).get();
  if (r.authorMemberId) pushToMember(r.roomId, r.authorMemberId, { title: 'Сказ не принят', body: p?.name ?? '', url: '/?tab=map', tag: `tale:${r.id}` });
}
export function deleteRumor(r: RumorRow): void {
  db.delete(schema.mapRumor).where(eq(schema.mapRumor.id, r.id)).run();
}

export function addPresence(p: PlaceRow, npcId: string, spotId: string | null, label: string): PresenceRow {
  const now = Date.now();
  const row: PresenceRow = { id: newId(), roomId: p.roomId, placeId: p.id, spotId, npcId, label, visible: false, createdAt: now, updatedAt: now };
  db.insert(schema.mapPresence).values(row).run();
  return row;
}
export function updatePresence(x: PresenceRow, patch: { spotId?: string | null; label?: string; visible?: boolean }): void {
  db.update(schema.mapPresence)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(schema.mapPresence.id, x.id))
    .run();
}
export function deletePresence(x: PresenceRow): void {
  db.delete(schema.mapPresence).where(eq(schema.mapPresence.id, x.id)).run();
}

export async function setPlaceImage(p: PlaceRow, input: Buffer): Promise<void> {
  const img = await storeImage(input);
  db.update(schema.mapPlace)
    .set({ ...img, updatedAt: Date.now() })
    .where(eq(schema.mapPlace.id, p.id))
    .run();
  removeImage(p.imageFile);
}
export function clearPlaceImage(p: PlaceRow): void {
  db.update(schema.mapPlace)
    .set({ ...NO_IMAGE, updatedAt: Date.now() })
    .where(eq(schema.mapPlace.id, p.id))
    .run();
  removeImage(p.imageFile);
}

// ---- черновики Claude ----

/** Регион, в котором стоит место (по контуру исходной карты). */
export function regionNameAt(mapId: MapId, x: number, y: number): string | null {
  const inside = (ring: number[][]) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as [number, number];
      const [xj, yj] = ring[j] as [number, number];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  return MAPS[mapId].regions.find((r) => r.shape.some((ring) => inside(ring)))?.name ?? null;
}

/**
 * Промпт черновика. Только то, что и так увидят игроки (канон мира, карта, земля, имя и вид места, открытое описание),
 * без заметок мастера: черновик — публичный текст, тайна в него попасть не должна.
 */
export function draftPrompt(part: PlaceDraft['part'], p: PlaceRow): string {
  const mapId = MapIdSchema.parse(p.mapId);
  const kind = PLACE_KIND_LABELS[PlaceKindSchema.catch('mark').parse(p.kind)];
  const region = regionNameAt(mapId, p.x, p.y);
  const spots = spotRows(p.id);
  const head = [
    'Ты помогаешь мастеру настольной ролевой игры «Зеленогорье» готовить карту мира.',
    `Канон мира: ${SUMMARY_LORE}`,
    `Карта: ${MAPS[mapId].title}.${region ? ` Земля: ${region}.` : ''}`,
    `Место: «${p.name || 'без имени'}» — ${kind.toLowerCase()}${p.subtitle ? `, ${p.subtitle}` : ''}.`,
    p.ruler ? `Правитель: ${p.ruler}.` : '',
    p.faction ? `Фракция: ${p.faction}.` : '',
    p.description ? `Описание сейчас: ${p.description}` : '',
    spots.length ? `Места в городе: ${spots.map((s) => `${s.name || SPOT_KIND_LABELS[SpotKindSchema.catch('other').parse(s.kind)]}`).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const rules = 'Пиши по-русски, живо и конкретно, в духе средневекового фэнтези этого мира. Без тайн, без имён персонажей игроков, без игровой механики и чисел бросков.';
  if (part === 'description')
    return `${head}\n\n${rules}\nНапиши описание этого места для игроков: 3–5 предложений — что видят и слышат путники, чем место живёт, что в нём особенного. Только текст описания, без заголовка и кавычек.`;
  if (part === 'spots')
    return `${head}\n\n${rules}\nПредложи 3–5 мест внутри этого поселения, куда могут зайти путники (как в Mount & Blade: замок, таверна, рынок, кузница, храм, гильдия, площадь, ворота, пристань). Ответ — только JSON-массив объектов {"kind": одно из ${JSON.stringify(SPOT_KINDS)}, "name": название места, "description": 1–2 предложения}.`;
  return `${head}\n\n${rules}\nПредложи 3 слуха или зацепки для заданий, которые путники могут услышать здесь. Ответ — только JSON-массив объектов {"kind": "rumor" или "quest", "text": 1–2 предложения от лица горожан}.`;
}

const SpotsDraft = z.array(z.object({ kind: z.string(), name: z.string().max(120), description: z.string().max(1000) })).min(1);
const RumorsDraft = z.array(z.object({ kind: z.string(), text: z.string().max(1000) })).min(1);

/** Ответ модели → черновик. null — ответ не разобрался. */
export function parseDraft(part: PlaceDraft['part'], text: string): PlaceDraft | null {
  if (part === 'description') {
    const t = text.trim().replace(/^["«]|["»]$/g, '');
    return t ? { part, text: t.slice(0, 4000) } : null;
  }
  const m = /\[[\s\S]*\]/.exec(text);
  if (!m) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (part === 'spots') {
    const r = SpotsDraft.safeParse(raw);
    if (!r.success) return null;
    return {
      part,
      spots: r.data
        .slice(0, 6)
        .map((s) => ({ kind: (SPOT_KINDS as readonly string[]).includes(s.kind) ? (s.kind as SpotKind) : 'other', name: s.name.trim(), description: s.description.trim() })),
    };
  }
  const r = RumorsDraft.safeParse(raw);
  if (!r.success) return null;
  return { part, rumors: r.data.slice(0, 5).map((x) => ({ kind: (RUMOR_KINDS as readonly string[]).includes(x.kind) ? (x.kind as RumorKind) : 'rumor', text: x.text.trim() })) };
}
