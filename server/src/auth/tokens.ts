import { createHash, randomBytes, randomInt } from 'node:crypto';
import { customAlphabet } from 'nanoid';

export const newId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Без похожих символов: 0/O, 1/I/L.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
