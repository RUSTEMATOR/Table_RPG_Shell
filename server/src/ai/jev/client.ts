import {
  APIConnectionError,
  APITimeoutError,
  AuthenticationError,
  RateLimitError,
  type Questions,
  type SystemOneRequest,
  type SystemOneResult,
  TypeSafeClient,
} from '@typesafe-ai/sdk';
import { config } from '../../config.ts';

// Единственная точка вызова Jev. Только сервер, ключ из JEV_API_KEY
// (SDK по умолчанию читает TYPESAFE_API_KEY, поэтому передаём явно).

let client: TypeSafeClient | null = null;

function getClient(): TypeSafeClient | null {
  if (!config.JEV_API_KEY) return null;
  client ??= new TypeSafeClient({
    apiKey: config.JEV_API_KEY,
    defaultModel: config.JEV_MODEL,
    timeout: 3000,
    retry: { maxRetries: 1 },
    // debug печатает тела запросов, а в них мастерские тексты.
    logLevel: 'warn',
  });
  return client;
}

export type JevFailure = 'no_key' | 'auth' | 'rate_limited' | 'timeout' | 'network' | 'error';

export type JevOutcome<Q extends Questions> =
  | { ok: true; result: SystemOneResult<Q>; ms: number }
  | { ok: false; reason: JevFailure; ms: number };

export async function askJev<const Q extends Questions>(request: SystemOneRequest<Q>): Promise<JevOutcome<Q>> {
  const started = Date.now();
  const c = getClient();
  if (!c) return { ok: false, reason: 'no_key', ms: 0 };
  try {
    const result = await c.systemOne(request);
    return { ok: true, result, ms: Date.now() - started };
  } catch (err) {
    const ms = Date.now() - started;
    if (err instanceof AuthenticationError) return { ok: false, reason: 'auth', ms };
    if (err instanceof RateLimitError) return { ok: false, reason: 'rate_limited', ms };
    if (err instanceof APITimeoutError) return { ok: false, reason: 'timeout', ms };
    if (err instanceof APIConnectionError) return { ok: false, reason: 'network', ms };
    return { ok: false, reason: 'error', ms };
  }
}

export const jevFeatures = {
  leakGuard: () => config.JEV_LEAK_GUARD,
  diaryMatch: () => config.JEV_DIARY_MATCH,
  rollIntent: () => config.JEV_ROLL_INTENT,
  greenMagic: () => config.JEV_GREEN_MAGIC,
};
