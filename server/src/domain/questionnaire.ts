import { and, eq } from 'drizzle-orm';
import { QuestionnaireAnswersSchema, QuestionnairePlayerSchema, type GmQuestionnaire, type QuestionnaireAnswers, type QuestionnairePlayer } from '@zg/shared';
import { db, schema } from '../db/client.ts';
import { pushToGm } from '../push/send.ts';
import { publish } from '../realtime/publish.ts';
import { SOURCES, UNIVERSES } from './data.ts';

// Анкета персонажа (этап 55): игрок пишет, мастер читает. В Jev и Claude не уходит.

const sources = SOURCES.map(([key, label]) => ({ key, label }));
const universes = Object.entries(UNIVERSES).map(([key, u]) => ({ key, label: u.name, genre: u.genre }));

function parse(raw: string): QuestionnaireAnswers | null {
  try {
    const a = QuestionnaireAnswersSchema.safeParse(JSON.parse(raw));
    return a.success ? a.data : null;
  } catch {
    return null;
  }
}

export function questionnaireForPlayer(roomId: string, memberId: string): QuestionnairePlayer {
  const r = db
    .select()
    .from(schema.questionnaire)
    .where(and(eq(schema.questionnaire.roomId, roomId), eq(schema.questionnaire.memberId, memberId)))
    .get();
  return QuestionnairePlayerSchema.parse({ answers: r ? parse(r.answers) : null, submittedAt: r?.submittedAt ?? null, sources, universes });
}

/** Сохранить; источник и вселенная — только из справочника (иное — пусто). */
export function saveQuestionnaire(roomId: string, memberId: string, memberName: string, a: QuestionnaireAnswers): void {
  const clean = {
    ...a,
    source: sources.some((x) => x.key === a.source) ? a.source : '',
    universe: a.universe && UNIVERSES[a.universe] ? a.universe : '',
  };
  const now = Date.now();
  const cur = db.select().from(schema.questionnaire).where(eq(schema.questionnaire.memberId, memberId)).get();
  db.insert(schema.questionnaire)
    .values({ memberId, roomId, answers: JSON.stringify(clean), submittedAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: schema.questionnaire.memberId, set: { answers: JSON.stringify(clean), updatedAt: now } })
    .run();
  publish(roomId, { kind: 'gm' }, 'gm:questionnaire.changed');
  pushToGm(roomId, { title: cur ? 'Анкета изменена' : 'Анкета персонажа', body: `от ${memberName}`, url: '/gm/new', tag: `questionnaire:${memberId}` });
}

export function questionnairesForGm(roomId: string): GmQuestionnaire[] {
  const owners = new Set(
    db
      .select({ o: schema.character.ownerMemberId })
      .from(schema.character)
      .where(eq(schema.character.roomId, roomId))
      .all()
      .map((c) => c.o)
      .filter(Boolean),
  );
  return db
    .select({ q: schema.questionnaire, name: schema.member.name })
    .from(schema.questionnaire)
    .innerJoin(schema.member, eq(schema.member.id, schema.questionnaire.memberId))
    .where(eq(schema.questionnaire.roomId, roomId))
    .all()
    .flatMap(({ q, name }) => {
      const a = parse(q.answers);
      if (!a) return [];
      return [
        {
          memberId: q.memberId,
          memberName: name,
          hasCharacter: owners.has(q.memberId),
          answers: a,
          sourceLabel: sources.find((x) => x.key === a.source)?.label ?? '',
          universeLabel: a.universe ? (UNIVERSES[a.universe]?.name ?? '') : '',
          submittedAt: q.submittedAt,
          updatedAt: q.updatedAt,
        },
      ];
    })
    .sort((x, y) => y.updatedAt - x.updatedAt);
}
