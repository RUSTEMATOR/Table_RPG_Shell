import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { SHELL_RATES, ShellsPlayerSchema, type Shell, type ShellsPlayer } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';

// Открываемые оболочки (этап 51). Заработанное считается из уже имеющихся данных: моменты, викторины, бестиарий, сессии.

const count = (q: { n: number } | undefined) => Number(q?.n ?? 0);

function earnedOf(roomId: string, characterId: string, ownerMemberId: string | null) {
  const moments = count(
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.moment)
      .where(eq(schema.moment.characterId, characterId))
      .get(),
  );
  const quizzes = ownerMemberId
    ? count(
        db
          .select({ n: sql<number>`count(*)` })
          .from(schema.chapterAnswer)
          .innerJoin(schema.chapter, eq(schema.chapter.id, schema.chapterAnswer.chapterId))
          .where(and(eq(schema.chapterAnswer.memberId, ownerMemberId), sql`${schema.chapterAnswer.score} = json_array_length(${schema.chapter.quiz})`))
          .get(),
      )
    : 0;
  const beasts = count(
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.bestiaryUnlock)
      .where(eq(schema.bestiaryUnlock.roomId, roomId))
      .get(),
  );
  const sessions = count(
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.gameSession)
      .where(and(eq(schema.gameSession.roomId, roomId), isNotNull(schema.gameSession.endedAt)))
      .get(),
  );
  return { moments, quizzes, beasts, sessions };
}

export function shellsOf(row: { id: string; roomId: string; ownerMemberId: string | null }): ShellsPlayer {
  const rows = db.select().from(schema.shellUnlock).where(eq(schema.shellUnlock.characterId, row.id)).all();
  const picked = rows.filter((r) => r.kind === 'pick' && r.shell).map((r) => r.shell as Shell);
  const gifts = rows.filter((r) => r.kind === 'grant').length;
  const e = earnedOf(row.roomId, row.id, row.ownerMemberId);
  const total =
    Math.floor(e.moments / SHELL_RATES.moments) +
    Math.floor(e.quizzes / SHELL_RATES.quizzes) +
    Math.floor(e.beasts / SHELL_RATES.beasts) +
    Math.floor(e.sessions / SHELL_RATES.sessions) +
    gifts;
  return ShellsPlayerSchema.parse({ picked, available: Math.max(0, total - picked.length), earned: { ...e, gifts } });
}

/** Игрок открывает оболочку за доступное открытие. */
export function pickShell(row: { id: string; roomId: string; ownerMemberId: string | null }, shell: Shell): 'ok' | 'already' | 'none' {
  const s = shellsOf(row);
  if (s.picked.includes(shell)) return 'already';
  if (s.available < 1) return 'none';
  db.insert(schema.shellUnlock).values({ id: newId(), roomId: row.roomId, characterId: row.id, kind: 'pick', shell, createdAt: Date.now() }).run();
  return 'ok';
}

export function grantShell(row: { id: string; roomId: string }): void {
  db.insert(schema.shellUnlock).values({ id: newId(), roomId: row.roomId, characterId: row.id, kind: 'grant', shell: null, createdAt: Date.now() }).run();
}
