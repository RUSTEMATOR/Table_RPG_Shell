import { and, asc, eq } from 'drizzle-orm';
import { BattlePublicSchema, TerrainCellSchema, inGrid, type BattlePublic, type GmBattle, type GmToken, type Terrain, type TerrainCell, type TokenKind } from '@zg/shared';
import { z } from 'zod';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { publish } from '../realtime/publish.ts';
import { loadCharacter } from './repo.ts';
import { npcFigure } from './npc.ts';
import { FigureSchema, type Figure } from '@zg/shared';

// Тактическое поле боя (этап 60). Единственное место, где поле превращается в то, что видят игроки и стол: battleFor.
// Скрытые фишки не уходят им совсем; у противников — только имя и фигурка.

type BattleRow = typeof schema.battle.$inferSelect;
type TokenRow = typeof schema.battleToken.$inferSelect;

const TerrainList = z.array(TerrainCellSchema);
function terrainOf(r: BattleRow): TerrainCell[] {
  try {
    const t = TerrainList.safeParse(JSON.parse(r.terrain));
    return t.success ? t.data.filter((c) => inGrid(c.col, c.row, r.cols, r.rows)) : [];
  } catch {
    return [];
  }
}

const getRow = (roomId: string) => db.select().from(schema.battle).where(eq(schema.battle.roomId, roomId)).get();
const tokenRows = (roomId: string) => db.select().from(schema.battleToken).where(eq(schema.battleToken.roomId, roomId)).orderBy(asc(schema.battleToken.createdAt)).all();

/** Имя и фигурка фишки — вживую из персонажа или библиотеки противников. */
function look(roomId: string, t: TokenRow): { name: string; figure: Figure | null; owner: string | null } {
  if (t.kind === 'character' && t.refId) {
    const lc = loadCharacter(roomId, t.refId);
    const f = FigureSchema.safeParse(lc?.doc.figure);
    return { name: lc?.row.name ?? 'Персонаж', figure: f.success ? f.data : null, owner: lc?.row.ownerMemberId ?? null };
  }
  if (t.kind === 'npc' && t.refId) {
    const n = db
      .select({ name: schema.npc.name, figure: schema.npc.figure })
      .from(schema.npc)
      .where(and(eq(schema.npc.roomId, roomId), eq(schema.npc.id, t.refId)))
      .get();
    return { name: t.label || n?.name || 'Противник', figure: n ? npcFigure(n) : null, owner: null };
  }
  return { name: t.label || 'Метка', figure: null, owner: null };
}

export function battleForGm(roomId: string): GmBattle | null {
  const r = getRow(roomId);
  if (!r) return null;
  const tokens: GmToken[] = tokenRows(roomId).map((t) => {
    const l = look(roomId, t);
    return { id: t.id, kind: t.kind as TokenKind, refId: t.refId, name: l.name, figure: l.figure, col: t.col, row: t.row, hidden: t.hidden };
  });
  return { title: r.title, cols: r.cols, rows: r.rows, terrain: terrainOf(r), tokens, open: r.open, playerMoves: r.playerMoves, updatedAt: r.updatedAt };
}

/** Игроку (memberId) или столу (null). Закрытое поле — null. */
export function battleFor(roomId: string, memberId: string | null): BattlePublic | null {
  const r = getRow(roomId);
  if (!r || !r.open) return null;
  const tokens = tokenRows(roomId)
    .filter((t) => !t.hidden)
    .map((t) => {
      const l = look(roomId, t);
      return { id: t.id, kind: t.kind as TokenKind, name: l.name, figure: l.figure, col: t.col, row: t.row, mine: memberId !== null && l.owner === memberId };
    });
  return BattlePublicSchema.parse({ title: r.title, cols: r.cols, rows: r.rows, terrain: terrainOf(r), tokens, playerMoves: r.playerMoves });
}

/** Разослать: мастеру — сигнал, каждому игроку — его проекция, столу — своя. */
export function notifyBattle(roomId: string): void {
  publish(roomId, { kind: 'gm' }, 'gm:battle.changed');
  const players = db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.roomId, roomId), eq(schema.member.role, 'player')))
    .all();
  for (const m of players) publish(roomId, { kind: 'member', memberId: m.id }, 'battle:changed', { battle: battleFor(roomId, m.id) });
  publish(roomId, { kind: 'table' }, 'battle:changed', { battle: battleFor(roomId, null) });
}

export function createBattle(roomId: string, w: { title: string; cols: number; rows: number }): void {
  const now = Date.now();
  db.delete(schema.battle).where(eq(schema.battle.roomId, roomId)).run();
  db.insert(schema.battle).values({ roomId, title: w.title, cols: w.cols, rows: w.rows, terrain: '[]', open: false, playerMoves: false, createdAt: now, updatedAt: now }).run();
  notifyBattle(roomId);
}

export function endBattle(roomId: string): void {
  db.delete(schema.battle).where(eq(schema.battle.roomId, roomId)).run();
  notifyBattle(roomId);
}

export function patchBattle(roomId: string, p: { title?: string; open?: boolean; playerMoves?: boolean; paint?: { col: number; row: number; t: Terrain | null } }): boolean {
  const r = getRow(roomId);
  if (!r) return false;
  const set: Partial<BattleRow> = { updatedAt: Date.now() };
  if (p.title !== undefined) set.title = p.title;
  if (p.open !== undefined) set.open = p.open;
  if (p.playerMoves !== undefined) set.playerMoves = p.playerMoves;
  if (p.paint && inGrid(p.paint.col, p.paint.row, r.cols, r.rows)) {
    const rest = terrainOf(r).filter((c) => c.col !== p.paint!.col || c.row !== p.paint!.row);
    set.terrain = JSON.stringify(p.paint.t ? [...rest, { col: p.paint.col, row: p.paint.row, t: p.paint.t }] : rest);
  }
  db.update(schema.battle).set(set).where(eq(schema.battle.roomId, roomId)).run();
  notifyBattle(roomId);
  return true;
}

const occupied = (roomId: string, col: number, row: number, except?: string) => tokenRows(roomId).some((t) => t.col === col && t.row === row && t.id !== except);
const blocked = (r: BattleRow, col: number, row: number) => terrainOf(r).some((c) => c.col === col && c.row === row && c.t === 'wall');

export function addToken(
  roomId: string,
  w: { kind: TokenKind; refId: string | null; label: string; col: number; row: number; hidden: boolean },
): 'ok' | 'no_battle' | 'bad_cell' | 'bad_ref' {
  const r = getRow(roomId);
  if (!r) return 'no_battle';
  if (!inGrid(w.col, w.row, r.cols, r.rows)) return 'bad_cell';
  if (w.kind !== 'mark' && !w.refId) return 'bad_ref';
  if (w.kind === 'character' && !loadCharacter(roomId, w.refId!)) return 'bad_ref';
  if (
    w.kind === 'npc' &&
    !db
      .select({ id: schema.npc.id })
      .from(schema.npc)
      .where(and(eq(schema.npc.roomId, roomId), eq(schema.npc.id, w.refId!)))
      .get()
  )
    return 'bad_ref';
  db.insert(schema.battleToken)
    .values({ id: newId(), roomId, kind: w.kind, refId: w.kind === 'mark' ? null : w.refId, label: w.label, col: w.col, row: w.row, hidden: w.hidden, createdAt: Date.now() })
    .run();
  notifyBattle(roomId);
  return 'ok';
}

export function getToken(roomId: string, id: string): TokenRow | undefined {
  return db
    .select()
    .from(schema.battleToken)
    .where(and(eq(schema.battleToken.roomId, roomId), eq(schema.battleToken.id, id)))
    .get();
}

/** Мастер двигает или скрывает фишку; стены мастеру не мешают (он рисует поле), занятая клетка — мешает. */
export function patchToken(t: TokenRow, p: { col?: number; row?: number; hidden?: boolean }): 'ok' | 'bad_cell' {
  const r = getRow(t.roomId)!;
  const col = p.col ?? t.col,
    row = p.row ?? t.row;
  if (!inGrid(col, row, r.cols, r.rows) || occupied(t.roomId, col, row, t.id)) return 'bad_cell';
  db.update(schema.battleToken)
    .set({ col, row, ...(p.hidden !== undefined ? { hidden: p.hidden } : {}) })
    .where(eq(schema.battleToken.id, t.id))
    .run();
  notifyBattle(t.roomId);
  return 'ok';
}

export function deleteToken(t: TokenRow): void {
  db.delete(schema.battleToken).where(eq(schema.battleToken.id, t.id)).run();
  notifyBattle(t.roomId);
}

/** Игрок двигает свою фишку: поле открыто, ходы разрешены, клетка в поле, не стена, не занята. */
export function playerMove(roomId: string, memberId: string, col: number, row: number): 'ok' | 'closed' | 'locked' | 'no_token' | 'bad_cell' {
  const r = getRow(roomId);
  if (!r || !r.open) return 'closed';
  if (!r.playerMoves) return 'locked';
  const mine = tokenRows(roomId).find((t) => t.kind === 'character' && !t.hidden && t.refId && loadCharacter(roomId, t.refId)?.row.ownerMemberId === memberId);
  if (!mine) return 'no_token';
  if (!inGrid(col, row, r.cols, r.rows) || blocked(r, col, row) || occupied(roomId, col, row, mine.id)) return 'bad_cell';
  db.update(schema.battleToken).set({ col, row }).where(eq(schema.battleToken.id, mine.id)).run();
  notifyBattle(roomId);
  return 'ok';
}
