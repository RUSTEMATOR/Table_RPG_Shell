import { hash, verify } from '@node-rs/argon2';

// argon2id (по умолчанию в @node-rs/argon2), параметры OWASP.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashSecret(secret: string): Promise<string> {
  return hash(secret, OPTS);
}

export async function verifySecret(hashed: string | null, secret: string): Promise<boolean> {
  if (!hashed) return false;
  try {
    return await verify(hashed, secret);
  } catch {
    return false;
  }
}

// Хэш для выравнивания времени ответа, когда участника нет.
let dummy: string | null = null;
export async function burnTime(secret: string): Promise<void> {
  dummy ??= await hashSecret('timing-equalizer');
  await verifySecret(dummy, secret);
}
