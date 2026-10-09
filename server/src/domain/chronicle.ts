import { and, asc, desc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import {
  ChapterPlayerSchema,
  EFFECT_LABELS,
  PHOTO_MAX,
  QUIZ_OPTIONS,
  QuizSchema,
  type ChapterPlayer,
  type Effect,
  type GmChapter,
  type GmSessionItem,
  type QuizQuestion,
} from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { pushToPlayers } from '../push/send.ts';
import { publish } from '../realtime/publish.ts';
import { SUMMARY_LORE } from './data.ts';
import { imageGm, imagePublic, removeImage, storeImage } from './media.ts';
import { loadOwnedCharacter } from './repo.ts';
import { awardSpark } from './sparks.ts';
import { notifyCharacterChanged } from '../realtime/notify.ts';

// Летопись (этап 43). Единственное место, где глава превращается в то, что видит игрок: chapterForPlayer.
// Игроку — только опубликованные главы; вопросы викторины без верных ответов, пока он не ответил.

export type ChapterRow = typeof schema.chapter.$inferSelect;
export type PhotoRow = typeof schema.chapterPhoto.$inferSelect;

export function photoRows(chapterId: string): PhotoRow[] {
  return db.select().from(schema.chapterPhoto).where(eq(schema.chapterPhoto.chapterId, chapterId)).orderBy(asc(schema.chapterPhoto.sort), asc(schema.chapterPhoto.createdAt)).all();
}
type AnswerRow = typeof schema.chapterAnswer.$inferSelect;

export function quizOf(r: ChapterRow): QuizQuestion[] | null {
  if (!r.quiz) return null;
  try {
    const q = QuizSchema.safeParse(JSON.parse(r.quiz));
    return q.success ? q.data : null;
  } catch {
    return null;
  }
}

const parseAnswers = (s: string): number[] => {
  try {
    const a = z.array(z.number().int()).safeParse(JSON.parse(s));
    return a.success ? a.data : [];
  } catch {
    return [];
  }
};

function myAnswer(chapterId: string, memberId: string): AnswerRow | undefined {
  return db
    .select()
    .from(schema.chapterAnswer)
    .where(and(eq(schema.chapterAnswer.chapterId, chapterId), eq(schema.chapterAnswer.memberId, memberId)))
    .get();
}

export function chapterForPlayer(r: ChapterRow, memberId: string): ChapterPlayer {
  const quiz = quizOf(r);
  const a = quiz ? myAnswer(r.id, memberId) : undefined;
  return ChapterPlayerSchema.parse({
    id: r.id,
    title: r.title,
    text: r.text,
    publishedAt: r.publishedAt ?? 0,
    photos: photoRows(r.id)
      .filter((p) => p.imageFile)
      .map((p) => ({ id: p.id, caption: p.caption, image: imagePublic(p)! })),
    quiz: quiz ? quiz.map((q) => ({ q: q.q, options: q.options })) : null,
    result: quiz && a ? { answers: parseAnswers(a.answers), correct: quiz.map((q) => q.answer), score: a.score, total: quiz.length, at: a.createdAt } : null,
  });
}

function answersForGm(roomId: string, chapterId: string, quizLen: number): GmChapter['answers'] {
  const chars = new Map(
    db
      .select({ owner: schema.character.ownerMemberId, name: schema.character.name })
      .from(schema.character)
      .where(eq(schema.character.roomId, roomId))
      .all()
      .filter((c) => c.owner)
      .map((c) => [c.owner!, c.name]),
  );
  return db
    .select({ a: schema.chapterAnswer, memberName: schema.member.name })
    .from(schema.chapterAnswer)
    .innerJoin(schema.member, eq(schema.member.id, schema.chapterAnswer.memberId))
    .where(eq(schema.chapterAnswer.chapterId, chapterId))
    .orderBy(asc(schema.chapterAnswer.createdAt))
    .all()
    .map(({ a, memberName }) => ({ memberName, characterName: chars.get(a.memberId) ?? null, answers: parseAnswers(a.answers), score: a.score, total: quizLen, at: a.createdAt }));
}

export function chapterForGm(r: ChapterRow): GmChapter {
  const quiz = quizOf(r);
  const s = r.sessionId ? db.select({ at: schema.gameSession.startedAt }).from(schema.gameSession).where(eq(schema.gameSession.id, r.sessionId)).get() : undefined;
  return {
    id: r.id,
    sessionId: r.sessionId,
    sessionStartedAt: s?.at ?? null,
    title: r.title,
    text: r.text,
    quiz,
    status: r.status,
    publishedAt: r.publishedAt,
    answers: quiz ? answersForGm(r.roomId, r.id, quiz.length) : [],
    photos: photoRows(r.id)
      .filter((p) => p.imageFile)
      .map((p) => ({ id: p.id, caption: p.caption, image: imageGm(p)! })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function getChapter(roomId: string, id: string): ChapterRow | undefined {
  return db
    .select()
    .from(schema.chapter)
    .where(and(eq(schema.chapter.roomId, roomId), eq(schema.chapter.id, id)))
    .get();
}

/** Игроку: опубликованные главы, новые сверху. */
export function listPublished(roomId: string): ChapterRow[] {
  return db
    .select()
    .from(schema.chapter)
    .where(and(eq(schema.chapter.roomId, roomId), eq(schema.chapter.status, 'published'), isNotNull(schema.chapter.publishedAt)))
    .orderBy(desc(schema.chapter.publishedAt))
    .all();
}

export function listChaptersForGm(roomId: string): GmChapter[] {
  return db.select().from(schema.chapter).where(eq(schema.chapter.roomId, roomId)).orderBy(desc(schema.chapter.updatedAt)).all().map(chapterForGm);
}

export function listSessionsForGm(roomId: string): GmSessionItem[] {
  const notes = new Set(
    db
      .select({ id: schema.sessionNote.sessionId })
      .from(schema.sessionNote)
      .all()
      .map((n) => n.id),
  );
  const chapters = db.select({ s: schema.chapter.sessionId }).from(schema.chapter).where(eq(schema.chapter.roomId, roomId)).all();
  return db
    .select({ id: schema.gameSession.id, startedAt: schema.gameSession.startedAt, endedAt: schema.gameSession.endedAt })
    .from(schema.gameSession)
    .where(eq(schema.gameSession.roomId, roomId))
    .orderBy(desc(schema.gameSession.startedAt))
    .limit(60)
    .all()
    .map((s) => ({ ...s, hasNote: notes.has(s.id), chapters: chapters.filter((c) => c.s === s.id).length }));
}

const players = (roomId: string) =>
  db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.roomId, roomId), eq(schema.member.role, 'player')))
    .all()
    .map((m) => m.id);

/** Опубликованная глава изменилась — каждому игроку своя проекция (у каждого свой результат викторины). */
function notifyPlayers(r: ChapterRow): void {
  if (r.status !== 'published') return;
  for (const m of players(r.roomId)) publish(r.roomId, { kind: 'member', memberId: m }, 'chronicle:changed', { chapter: chapterForPlayer(r, m) });
}
const notifyGm = (r: ChapterRow) => publish(r.roomId, { kind: 'gm' }, 'gm:chronicle.changed', { id: r.id });

export function createChapter(roomId: string, w: { sessionId: string | null; title: string; text: string; quiz: QuizQuestion[] | null }): ChapterRow {
  const now = Date.now();
  const row: ChapterRow = {
    id: newId(),
    roomId,
    sessionId: w.sessionId,
    title: w.title,
    text: w.text,
    quiz: w.quiz ? JSON.stringify(w.quiz) : null,
    status: 'draft',
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.chapter).values(row).run();
  notifyGm(row);
  return row;
}

export function updateChapter(r: ChapterRow, patch: { sessionId?: string | null; title?: string; text?: string; quiz?: QuizQuestion[] | null }): ChapterRow {
  const set: Partial<ChapterRow> = { updatedAt: Date.now() };
  if (patch.sessionId !== undefined) set.sessionId = patch.sessionId;
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.text !== undefined) set.text = patch.text;
  if (patch.quiz !== undefined) {
    set.quiz = patch.quiz ? JSON.stringify(patch.quiz) : null;
    // новая викторина — прежние ответы не к ней
    if (JSON.stringify(quizOf(r)) !== JSON.stringify(patch.quiz)) db.delete(schema.chapterAnswer).where(eq(schema.chapterAnswer.chapterId, r.id)).run();
  }
  db.update(schema.chapter).set(set).where(eq(schema.chapter.id, r.id)).run();
  const next = { ...r, ...set };
  notifyPlayers(next);
  notifyGm(next);
  return next;
}

export function setPublished(r: ChapterRow, on: boolean): ChapterRow {
  const now = Date.now();
  const set = on ? { status: 'published' as const, publishedAt: r.publishedAt ?? now, updatedAt: now } : { status: 'draft' as const, updatedAt: now };
  db.update(schema.chapter).set(set).where(eq(schema.chapter.id, r.id)).run();
  const next = { ...r, ...set };
  if (on) {
    notifyPlayers(next);
    if (r.status !== 'published') pushToPlayers(r.roomId, { title: 'Новая глава летописи', body: r.title, url: '/?tab=chronicle', tag: `chapter:${r.id}` });
  } else for (const m of players(r.roomId)) publish(r.roomId, { kind: 'member', memberId: m }, 'chronicle:removed', { id: r.id });
  notifyGm(next);
  return next;
}

export function deleteChapter(r: ChapterRow): void {
  for (const p of photoRows(r.id)) removeImage(p.imageFile);
  db.delete(schema.chapter).where(eq(schema.chapter.id, r.id)).run();
  if (r.status === 'published') for (const m of players(r.roomId)) publish(r.roomId, { kind: 'member', memberId: m }, 'chronicle:removed', { id: r.id });
  notifyGm(r);
}

/** Ответ игрока — один раз. Счёт считается на сервере. */
export function answerQuiz(r: ChapterRow, memberId: string, answers: number[]): { ok: true; chapter: ChapterPlayer } | { ok: false; error: 'no_quiz' | 'already' | 'bad_length' } {
  const quiz = quizOf(r);
  if (!quiz || r.status !== 'published') return { ok: false, error: 'no_quiz' };
  if (myAnswer(r.id, memberId)) return { ok: false, error: 'already' };
  if (answers.length !== quiz.length) return { ok: false, error: 'bad_length' };
  const score = quiz.reduce((n, q, i) => n + (q.answer === answers[i] ? 1 : 0), 0);
  db.insert(schema.chapterAnswer)
    .values({ id: newId(), chapterId: r.id, memberId, answers: JSON.stringify(answers), score, createdAt: Date.now() })
    .run();
  // без ошибок — искра (этап 48), если у игрока есть персонаж
  if (score === quiz.length) {
    const lc = loadOwnedCharacter(r.roomId, memberId);
    if (lc) {
      awardSpark(r.roomId, lc.row, 'quiz', `Викторина: ${r.title}`);
      notifyCharacterChanged(r.roomId, lc);
    }
  }
  notifyGm(r);
  return { ok: true, chapter: chapterForPlayer(r, memberId) };
}

// ---- материал сессии и подсказки Claude ----

/** Что знает Claude о сессии: заметки мастера, публичные броски, записи дневников (не личные, не вопросы). */
export function sessionMaterial(roomId: string, sessionId: string | null): string {
  const parts: string[] = [];
  const s = sessionId
    ? db
        .select()
        .from(schema.gameSession)
        .where(and(eq(schema.gameSession.id, sessionId), eq(schema.gameSession.roomId, roomId)))
        .get()
    : undefined;
  if (s) {
    const from = s.startedAt;
    const to = s.endedAt ?? Date.now();
    const d = (t: number) => new Date(t).toLocaleDateString('ru-RU');
    parts.push(`Сессия ${d(from)}${s.endedAt ? ` — ${d(to)}` : ' (идёт)'}.`);
    const note = db.select({ text: schema.sessionNote.text }).from(schema.sessionNote).where(eq(schema.sessionNote.sessionId, s.id)).get();
    if (note?.text.trim()) parts.push(`Заметки мастера:\n${note.text.trim().slice(0, 12000)}`);
    const rolls = db
      .select()
      .from(schema.roll)
      .where(and(eq(schema.roll.roomId, roomId), eq(schema.roll.visibility, 'public'), gte(schema.roll.createdAt, from), lte(schema.roll.createdAt, to)))
      .orderBy(asc(schema.roll.createdAt))
      .limit(80)
      .all();
    if (rolls.length)
      parts.push(
        `Броски игроков (по порядку):\n${rolls.map((r) => `- ${r.characterName ?? 'кто-то'}: ${r.label || r.kind} — ${EFFECT_LABELS[r.effect as Effect] ?? r.effect}`).join('\n')}`,
      );
    const chars = new Map(
      db
        .select({ id: schema.character.id, name: schema.character.name })
        .from(schema.character)
        .where(eq(schema.character.roomId, roomId))
        .all()
        .map((c) => [c.id, c.name]),
    );
    // Правило 7: личные записи не уходят никуда. Вопросы мастеру — тоже не материал для главы.
    const diary = db
      .select()
      .from(schema.diaryEntry)
      .where(
        and(
          eq(schema.diaryEntry.roomId, roomId),
          eq(schema.diaryEntry.private, false),
          eq(schema.diaryEntry.request, false),
          gte(schema.diaryEntry.createdAt, from),
          lte(schema.diaryEntry.createdAt, to),
        ),
      )
      .orderBy(asc(schema.diaryEntry.createdAt))
      .limit(20)
      .all();
    if (diary.length)
      parts.push(`Записи дневников персонажей:\n${diary.map((e) => `- ${(e.characterId && chars.get(e.characterId)) || 'персонаж'}: ${e.text.trim().slice(0, 1500)}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

export function chapterPrompt(material: string, hint: string): string {
  return [
    'Ты помогаешь мастеру настольной ролевой игры «Зеленогорье» писать главу летописи кампании для игроков.',
    `Канон мира: ${SUMMARY_LORE}`,
    material || 'Материала о сессии нет: напиши короткую главу-связку по подсказке мастера.',
    hint ? `Подсказка мастера: ${hint}` : '',
    '',
    'Напиши по-русски главу летописи от третьего лица, как летописец этого мира: заголовок в первой строке (без «#» и кавычек), затем 4–7 абзацев. Опирайся только на материал выше; тайны мастера, скрытые черты и то, чего персонажи не знают, не раскрывай. Без игровой механики и чисел бросков — только события, поступки и их последствия. Только текст.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export function quizPrompt(title: string, text: string): string {
  return [
    `Глава летописи «${title}»:\n${text.slice(0, 20000)}`,
    '',
    `Составь по этой главе 3 вопроса для игроков «Что ты помнишь?» — о событиях, именах и решениях из текста. У каждого ${QUIZ_OPTIONS} коротких варианта, один верный; неверные — правдоподобные. Ответ — только JSON-массив объектов {"q": вопрос, "options": [${QUIZ_OPTIONS} строки], "answer": индекс верного (0–${QUIZ_OPTIONS - 1})}.`,
  ].join('\n');
}

export function parseChapterDraft(text: string): { title: string; text: string } | null {
  const lines = text.trim().split('\n');
  const title = (lines.shift() ?? '')
    .replace(/^#+\s*/, '')
    .replace(/^["«]|["»]$/g, '')
    .trim();
  const body = lines.join('\n').trim();
  if (!title || !body) return null;
  return { title: title.slice(0, 200), text: body.slice(0, 30000) };
}

export function parseQuizDraft(text: string): QuizQuestion[] | null {
  const m = /\[[\s\S]*\]/.exec(text);
  if (!m) return null;
  try {
    const q = QuizSchema.safeParse(JSON.parse(m[0]));
    return q.success ? q.data : null;
  } catch {
    return null;
  }
}

// ---- фото сессии (этап 53) ----

export function getPhoto(roomId: string, id: string): PhotoRow | undefined {
  return db
    .select()
    .from(schema.chapterPhoto)
    .where(and(eq(schema.chapterPhoto.roomId, roomId), eq(schema.chapterPhoto.id, id)))
    .get();
}

function touched(chapterId: string): ChapterRow | undefined {
  const r = db.select().from(schema.chapter).where(eq(schema.chapter.id, chapterId)).get();
  if (!r) return undefined;
  notifyPlayers(r);
  notifyGm(r);
  return r;
}

export async function addPhoto(r: ChapterRow, input: Buffer): Promise<'ok' | 'too_many'> {
  const list = photoRows(r.id);
  if (list.length >= PHOTO_MAX) return 'too_many';
  const img = await storeImage(input);
  db.insert(schema.chapterPhoto)
    .values({ id: newId(), roomId: r.roomId, chapterId: r.id, caption: '', sort: (list[list.length - 1]?.sort ?? 0) + 1, ...img, createdAt: Date.now() })
    .run();
  touched(r.id);
  return 'ok';
}

export function captionPhoto(p: PhotoRow, caption: string): void {
  db.update(schema.chapterPhoto).set({ caption }).where(eq(schema.chapterPhoto.id, p.id)).run();
  touched(p.chapterId);
}

export function deletePhoto(p: PhotoRow): void {
  db.delete(schema.chapterPhoto).where(eq(schema.chapterPhoto.id, p.id)).run();
  removeImage(p.imageFile);
  touched(p.chapterId);
}
