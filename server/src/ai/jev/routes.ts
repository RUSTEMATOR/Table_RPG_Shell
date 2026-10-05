import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGm } from '../../auth/requireGm.ts';
import { config } from '../../config.ts';
import { runDiaryMatch } from './questions/diaryMatch.ts';
import { GREEN_MAGIC_DEFINITION, runGreenMagic } from './questions/greenMagic.ts';
import { runLeakGuard } from './questions/leakGuard.ts';
import { runRollIntent } from './questions/rollIntent.ts';
import type { JevTrait } from './questions/types.ts';
import { isDemoRoom } from '../../domain/demo.ts';

// Песочница Jev (этап J0): мастер руками проверяет вопросы на своих примерах.
// Один запрос — одно нажатие, без пакетных прогонов.

const TraitInput = z.strictObject({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  hinted: z.boolean().default(false),
});

const AskSchema = z.discriminatedUnion('fn', [
  z.strictObject({ fn: z.literal('leakGuard'), text: z.string().min(1).max(8000), traits: z.array(TraitInput).min(1).max(20) }),
  z.strictObject({ fn: z.literal('diaryMatch'), text: z.string().min(1).max(8000), traits: z.array(TraitInput).min(1).max(20) }),
  z.strictObject({ fn: z.literal('rollIntent'), text: z.string().min(1).max(2000), traits: z.array(TraitInput).max(20) }),
  z.strictObject({ fn: z.literal('greenMagic'), text: z.string().min(1).max(2000), definition: z.string().max(2000).optional() }),
]);

const keyed = (traits: z.infer<typeof TraitInput>[]): (JevTrait & { hinted: boolean })[] =>
  traits.map((t, i) => ({ key: `t${i + 1}`, name: t.name, description: t.description, hinted: t.hinted }));

export async function jevRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/gm/')) return requireGm(request, reply);
  });

  app.get('/api/gm/jev/info', async () => ({
    configured: !!config.JEV_API_KEY,
    model: config.JEV_MODEL,
    greenMagicDefinition: GREEN_MAGIC_DEFINITION,
    features: {
      leakGuard: config.JEV_LEAK_GUARD,
      diaryMatch: config.JEV_DIARY_MATCH,
      rollIntent: config.JEV_ROLL_INTENT,
      greenMagic: config.JEV_GREEN_MAGIC,
    },
  }));

  app.post('/api/gm/jev/ask', async (request, reply) => {
    if (isDemoRoom(request.auth!.room.id)) return reply.code(403).send({ error: 'demo', message: 'В демо-комнате ИИ выключен' });
    const body = AskSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request', message: body.error.issues[0]?.message });
    const b = body.data;
    let outcome;
    let keys: { key: string; name: string }[] = [];
    switch (b.fn) {
      case 'leakGuard': {
        const ts = keyed(b.traits);
        keys = ts;
        outcome = await runLeakGuard({ text: b.text, hidden: ts.filter((t) => !t.hinted), hinted: ts.filter((t) => t.hinted) });
        break;
      }
      case 'diaryMatch': {
        const ts = keyed(b.traits);
        keys = ts;
        outcome = await runDiaryMatch({ entry: b.text, hidden: ts });
        break;
      }
      case 'rollIntent': {
        const ts = keyed(b.traits);
        keys = ts;
        outcome = await runRollIntent({ action: b.text, revealed: ts });
        break;
      }
      case 'greenMagic':
        outcome = await runGreenMagic(b.definition ? { action: b.text, definition: b.definition } : { action: b.text });
        break;
    }
    if (!outcome.ok) {
      request.log.warn({ reason: outcome.reason, fn: b.fn }, 'jev: запрос не удался');
      return reply.code(502).send({ error: 'jev_unavailable', message: outcome.reason });
    }
    return {
      fn: b.fn,
      ms: outcome.ms,
      model: outcome.result.model,
      usage: outcome.result.usage,
      traits: keys.map((k) => ({ key: k.key, name: k.name })),
      answers: outcome.result.answers,
    };
  });
}
