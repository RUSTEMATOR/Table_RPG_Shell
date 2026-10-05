import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';
import { newToken, sha256 } from './tokens.ts';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Выдаёт новое приглашение участнику; старое перестаёт работать. */
export function issueInvite(memberId: string): { path: string; expiresAt: number } {
  const token = newToken();
  const expiresAt = Date.now() + INVITE_TTL_MS;
  db.update(schema.member)
    .set({ inviteTokenHash: sha256(token), inviteExpiresAt: expiresAt, inviteUsedAt: null })
    .where(eq(schema.member.id, memberId))
    .run();
  return { path: `/join/${token}`, expiresAt };
}
