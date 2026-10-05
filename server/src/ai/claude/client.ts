import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.ts';

// Claude API — только на сервере. Ключ из ANTHROPIC_API_KEY, модели — из .env.
// Сводки: ANTHROPIC_MODEL_SUMMARY (Sonnet 5.5), быстрые черновики: ANTHROPIC_MODEL_DRAFT (Haiku 4.5).

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!config.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 });
  return client;
}

export type ClaudeFailure = 'no_key' | 'auth' | 'rate_limited' | 'timeout' | 'network' | 'refused' | 'too_long' | 'error';

export type ClaudeOutcome =
  | { ok: true; text: string; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; reason: ClaudeFailure };

const textOf = (content: { type: string; text?: string }[]) =>
  content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();

/** Один запрос: промпт целиком в сообщении пользователя, как в рандомизаторе. */
export async function generateText(prompt: string, quick: boolean): Promise<ClaudeOutcome> {
  const c = getClient();
  if (!c) return { ok: false, reason: 'no_key' };
  try {
    if (quick) {
      // Haiku 4.5: без параметров thinking и effort.
      const r = await c.messages.create({
        model: config.ANTHROPIC_MODEL_DRAFT,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });
      if (r.stop_reason === 'refusal') return { ok: false, reason: 'refused' };
      if (r.stop_reason === 'max_tokens') return { ok: false, reason: 'too_long' };
      return { ok: true, text: textOf(r.content), model: r.model, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens };
    }
    // Sonnet 5.5: адаптивное мышление по умолчанию; при отказе классификатора сервер сам
    // повторит запрос на запасной модели (fallbacks: 'default').
    const r = await c.beta.messages.create({
      model: config.ANTHROPIC_MODEL_SUMMARY,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    });
    if (r.stop_reason === 'refusal') return { ok: false, reason: 'refused' };
    if (r.stop_reason === 'max_tokens') return { ok: false, reason: 'too_long' };
    return { ok: true, text: textOf(r.content), model: r.model, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return { ok: false, reason: 'auth' };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: 'rate_limited' };
    if (err instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: 'timeout' };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, reason: 'network' };
    return { ok: false, reason: 'error' };
  }
}

export const claudeConfigured = () => !!config.ANTHROPIC_API_KEY;
