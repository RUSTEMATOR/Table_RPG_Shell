import { desc, eq, sql } from 'drizzle-orm';
import type { GmSparks, SparkKind } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { pushToMember } from '../push/send.ts';

// Искры (этап 48): журнал ±1. Начисляет мастер (и викторина летописи), тратит игрок на переброс (rollService).

export function sparkBalance(characterId: string): number {
  const r = db
    .select({ n: sql<number>`coalesce(sum(${schema.spark.delta}), 0)` })
    .from(schema.spark)
    .where(eq(schema.spark.characterId, characterId))
    .get();
  return Math.max(0, Number(r?.n ?? 0));
}

export function sparksForGm(characterId: string): GmSparks {
  return {
    balance: sparkBalance(characterId),
    ledger: db
      .select()
      .from(schema.spark)
      .where(eq(schema.spark.characterId, characterId))
      .orderBy(desc(schema.spark.createdAt))
      .limit(50)
      .all()
      .map((r) => ({ id: r.id, delta: r.delta, kind: r.kind, reason: r.reason, at: r.createdAt })),
  };
}

/** +1 искра; владельцу — push (без текста мастера сверх причины, которую игрок и так увидит в журнале… нет: игрок видит только баланс). */
export function awardSpark(roomId: string, c: { id: string; ownerMemberId: string | null }, kind: Exclude<SparkKind, 'spend'>, reason: string): void {
  db.insert(schema.spark).values({ id: newId(), roomId, characterId: c.id, delta: 1, kind, reason, rollId: null, createdAt: Date.now() }).run();
  if (c.ownerMemberId)
    pushToMember(roomId, c.ownerMemberId, { title: 'Искра', body: kind === 'quiz' ? 'За викторину без ошибок' : 'Мастер дал искру', url: '/?tab=rolls', tag: 'spark' });
}

/** −1 за переброс; false — искр нет. */
export function spendSpark(roomId: string, characterId: string, rollId: string): boolean {
  if (sparkBalance(characterId) < 1) return false;
  db.insert(schema.spark).values({ id: newId(), roomId, characterId, delta: -1, kind: 'spend', reason: 'Переброс', rollId, createdAt: Date.now() }).run();
  return true;
}
