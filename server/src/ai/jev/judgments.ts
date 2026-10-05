import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../../db/client.ts';

export function saveJudgment(roomId: string, kind: string, subjectRef: string, model: string, answers: unknown): void {
  db.insert(schema.aiJudgment)
    .values({ roomId, kind, subjectRef, model, answers: JSON.stringify(answers), createdAt: Date.now() })
    .run();
}

export function lastJudgment<T>(kind: string, subjectRef: string): T | null {
  const r = db
    .select()
    .from(schema.aiJudgment)
    .where(and(eq(schema.aiJudgment.kind, kind), eq(schema.aiJudgment.subjectRef, subjectRef)))
    .orderBy(desc(schema.aiJudgment.id))
    .limit(1)
    .get();
  return r ? (JSON.parse(r.answers) as T) : null;
}
