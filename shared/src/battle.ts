import { z } from 'zod';
import { FigureSchema, type Figure } from './figure.ts';

// Тактическое поле боя (этап 60): шестиугольная сетка (острый верх, осевые координаты q, r в виде «смещённых» столбцов/строк:
// col 0..cols-1, row 0..rows-1). Одно поле на комнату. Скрытые фишки игрокам и столу не уходят.

export const BATTLE_LIMITS = { minCols: 8, maxCols: 30, minRows: 6, maxRows: 20 } as const;
export const TERRAINS = ['wall', 'rough', 'water'] as const;
export type Terrain = (typeof TERRAINS)[number];
export const TERRAIN_LABELS: Record<Terrain, string> = { wall: 'Стена', rough: 'Труднопроходимо', water: 'Вода' };

export const CellSchema = z.strictObject({
  col: z
    .number()
    .int()
    .min(0)
    .max(BATTLE_LIMITS.maxCols - 1),
  row: z
    .number()
    .int()
    .min(0)
    .max(BATTLE_LIMITS.maxRows - 1),
});
export type Cell = z.infer<typeof CellSchema>;
export const TerrainCellSchema = z.strictObject({ col: z.number().int(), row: z.number().int(), t: z.enum(TERRAINS) });
export type TerrainCell = z.infer<typeof TerrainCellSchema>;

export const TOKEN_KINDS = ['character', 'npc', 'mark'] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];

export const TokenPublicSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(TOKEN_KINDS),
  name: z.string(),
  figure: FigureSchema.nullable(),
  col: z.number().int(),
  row: z.number().int(),
  /** Фишка своего персонажа (игроку). */
  mine: z.boolean(),
});
export type TokenPublic = z.infer<typeof TokenPublicSchema>;

export const BattlePublicSchema = z.strictObject({
  title: z.string(),
  cols: z.number().int(),
  rows: z.number().int(),
  terrain: z.array(TerrainCellSchema),
  tokens: z.array(TokenPublicSchema),
  playerMoves: z.boolean(),
});
export type BattlePublic = z.infer<typeof BattlePublicSchema>;
export const BattleResponseSchema = z.strictObject({ battle: BattlePublicSchema.nullable() });

export interface GmToken {
  id: string;
  kind: TokenKind;
  refId: string | null;
  name: string;
  figure: Figure | null;
  col: number;
  row: number;
  hidden: boolean;
}
export interface GmBattle {
  title: string;
  cols: number;
  rows: number;
  terrain: TerrainCell[];
  tokens: GmToken[];
  open: boolean;
  playerMoves: boolean;
  updatedAt: number;
}

export const BattleCreateSchema = z.strictObject({
  title: z.string().trim().max(80).default(''),
  cols: z.number().int().min(BATTLE_LIMITS.minCols).max(BATTLE_LIMITS.maxCols),
  rows: z.number().int().min(BATTLE_LIMITS.minRows).max(BATTLE_LIMITS.maxRows),
});
export const BattlePatchSchema = z.strictObject({
  title: z.string().trim().max(80).optional(),
  open: z.boolean().optional(),
  playerMoves: z.boolean().optional(),
  /** Кисть местности: клетка и вид (null — очистить). */
  paint: z.strictObject({ col: z.number().int(), row: z.number().int(), t: z.enum(TERRAINS).nullable() }).optional(),
});
export const BattleTokenAddSchema = z.strictObject({
  kind: z.enum(TOKEN_KINDS),
  refId: z.string().min(1).max(64).nullable().default(null),
  label: z.string().trim().max(40).default(''),
  col: z.number().int(),
  row: z.number().int(),
  hidden: z.boolean().default(false),
});
export const BattleTokenPatchSchema = z.strictObject({ col: z.number().int().optional(), row: z.number().int().optional(), hidden: z.boolean().optional() });
export const PlayerMoveSchema = z.strictObject({ col: z.number().int(), row: z.number().int() });

// ---- геометрия: шестиугольники с острым верхом, нечётные строки сдвинуты вправо ----

/** Центр клетки в единицах «радиуса» (размер = 1). */
export function hexCenter(col: number, row: number): { x: number; y: number } {
  const w = Math.sqrt(3);
  return { x: w * (col + 0.5 * (row & 1)) + w / 2, y: 1.5 * row + 1 };
}
/** Габарит поля в тех же единицах. */
export function gridSize(cols: number, rows: number): { w: number; h: number } {
  return { w: Math.sqrt(3) * (cols + 0.5), h: 1.5 * rows + 0.5 };
}
/** Вершины шестиугольника для SVG points. */
export function hexPoints(col: number, row: number, r = 1): string {
  const c = hexCenter(col, row);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(c.x + r * Math.cos(a)).toFixed(3)},${(c.y + r * Math.sin(a)).toFixed(3)}`;
  }).join(' ');
}
export const inGrid = (col: number, row: number, cols: number, rows: number) => col >= 0 && row >= 0 && col < cols && row < rows;
