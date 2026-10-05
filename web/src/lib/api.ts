export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; message?: string; retryAfterSec?: number };

export async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: 'network' };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {}
  if (res.ok) return { ok: true, data: json as T };
  const e = (json ?? {}) as { error?: string; message?: string; retryAfterSec?: number };
  return {
    ok: false,
    status: res.status,
    error: e.error ?? 'unknown',
    ...(e.message ? { message: e.message } : {}),
    ...(e.retryAfterSec !== undefined ? { retryAfterSec: e.retryAfterSec } : {}),
  };
}

export const BUILD_ID: string = import.meta.env.VITE_BUILD_ID ?? 'dev';
