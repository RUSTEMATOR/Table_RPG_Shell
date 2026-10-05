import type { FastifyInstance, FastifyReply } from 'fastify';
import { SUMMARY_KINDS, SummaryGenerateSchema, SummarySaveSchema, type SummaryCheck, type SummaryKindKey, type SummaryOptions } from '@zg/shared';
import { checkFacts, checkPublicText } from '../ai/jev/integrations.ts';
import { claudeConfigured, generateText, type ClaudeFailure } from '../ai/claude/client.ts';
import { isDemoRoom } from '../domain/demo.ts';
import { requireGm } from '../auth/requireGm.ts';
import { pronounWord } from '../domain/character.ts';
import { loadCharacter, saveDoc } from '../domain/repo.ts';
import { SUMMARY_PERSONS, SUM_TONES, buildPrompt, hasPerson, summaryData } from '../domain/summaries.ts';
import { characterView } from '../domain/views.ts';
import { notifyCharacterChanged } from '../realtime/notify.ts';

const FAILURE_TEXT: Record<ClaudeFailure, string> = {
  no_key: 'Ключ Claude API не задан (ANTHROPIC_API_KEY).',
  auth: 'Claude API не принял ключ.',
  rate_limited: 'Claude API просит подождать: слишком много запросов.',
  timeout: 'Claude API не ответил вовремя.',
  network: 'Нет связи с Claude API.',
  refused: 'Модель отказалась писать этот текст.',
  too_long: 'Ответ не поместился, попробуйте ещё раз.',
  error: 'Claude API вернул ошибку.',
};

function kindOf(reply: FastifyReply, k: string): SummaryKindKey | null {
  if ((SUMMARY_KINDS as readonly string[]).includes(k)) return k as SummaryKindKey;
  void reply.code(404).send({ error: 'not_found' });
  return null;
}

export async function summaryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  app.get('/api/gm/summary-options', async (): Promise<SummaryOptions> => ({
    configured: claudeConfigured(),
    tones: SUM_TONES,
    persons: SUMMARY_PERSONS,
  }));

  // Новый текст всегда приходит неопубликованным: игрок увидит его только после «Опубликовать».
  app.post<{ Params: { id: string; kind: string } }>('/api/gm/characters/:id/summary/:kind/generate', async (request, reply) => {
    const kind = kindOf(reply, request.params.kind);
    if (!kind) return;
    const b = SummaryGenerateSchema.safeParse(request.body);
    if (!b.success || !SUM_TONES.includes(b.data.tone)) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    if (isDemoRoom(roomId)) return reply.code(403).send({ error: 'demo', message: 'В демо-комнате ИИ выключен' });
    const lc = loadCharacter(roomId, request.params.id);
    if (!lc || lc.row.kind !== 'popadanets') return reply.code(404).send({ error: 'not_found' });
    const person = hasPerson(kind) ? b.data.person : '';
    const prompt = buildPrompt(kind, summaryData(kind, lc), { tone: b.data.tone, person: person || '2', pronoun: pronounWord(lc.doc.pronoun) });
    const res = await generateText(prompt, b.data.quick);
    if (!res.ok) {
      request.log.warn({ reason: res.reason, kind }, 'claude: сводка не получилась');
      return reply.code(502).send({ error: 'claude_unavailable', message: FAILURE_TEXT[res.reason] });
    }
    request.log.info({ kind, model: res.model, in: res.inputTokens, out: res.outputTokens }, 'claude: сводка готова');
    lc.doc.summary = {
      ...lc.doc.summary,
      [kind]: { text: res.text, at: Date.now(), edited: false, show: false, tone: b.data.tone, ...(person ? { person } : {}), model: res.model },
    };
    saveDoc(lc.row.id, lc.doc);
    notifyCharacterChanged(roomId, lc);
    return characterView(lc);
  });

  app.post<{ Params: { id: string; kind: string } }>('/api/gm/characters/:id/summary/:kind', async (request, reply) => {
    const kind = kindOf(reply, request.params.kind);
    if (!kind) return;
    const b = SummarySaveSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const lc = loadCharacter(roomId, request.params.id);
    if (!lc || lc.row.kind !== 'popadanets') return reply.code(404).send({ error: 'not_found' });
    const cur = lc.doc.summary?.[kind] ?? { text: '', at: 0, edited: false };
    const next = { ...cur };
    if (b.data.text !== undefined && b.data.text !== cur.text) {
      next.text = b.data.text;
      next.edited = true;
      next.at = Date.now();
    }
    if (b.data.show !== undefined && kind !== 'gm') next.show = b.data.show && !!next.text?.trim();
    lc.doc.summary = { ...lc.doc.summary, [kind]: next };
    saveDoc(lc.row.id, lc.doc);
    notifyCharacterChanged(roomId, lc);
    return characterView(lc);
  });

  // Проверка Jev перед публикацией: выдумки относительно данных и утечки скрытых черт.
  app.post<{ Params: { id: string; kind: string } }>('/api/gm/characters/:id/summary/:kind/check', async (request, reply) => {
    const kind = kindOf(reply, request.params.kind);
    if (!kind) return;
    const roomId = request.auth!.room.id;
    const lc = loadCharacter(roomId, request.params.id);
    const text = lc?.doc.summary?.[kind]?.text ?? '';
    if (!lc || !text.trim()) return reply.code(404).send({ error: 'not_found' });
    const [facts, leak] = await Promise.all([
      checkFacts(roomId, `${lc.row.id}:${kind}`, summaryData(kind, lc), text),
      kind === 'gm' ? Promise.resolve({ status: 'off' as const, others: [] }) : checkPublicText(roomId, text, [lc.doc]),
    ]);
    const out: SummaryCheck = { facts, leak };
    return out;
  });
}
