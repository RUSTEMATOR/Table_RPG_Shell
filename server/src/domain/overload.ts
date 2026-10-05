import { eq } from 'drizzle-orm';
import type { GmOverload, OverloadSign } from '@zg/shared';
import { db, schema } from '../db/client.ts';
import type { CharacterRow } from './repo.ts';

type Row = typeof schema.greenOverload.$inferSelect;

export function signOf(r: Pick<Row, 'value' | 'eyesAt' | 'skinAt'>): OverloadSign {
  if (r.value >= r.skinAt) return 'skin';
  if (r.value >= r.eyesAt) return 'eyes';
  return 'none';
}

function rowFor(characterId: string): Row {
  const r = db.select().from(schema.greenOverload).where(eq(schema.greenOverload.characterId, characterId)).get();
  if (r) return r;
  const fresh: Row = { characterId, value: 0, eyesAt: 3, skinAt: 6, updatedAt: Date.now() };
  db.insert(schema.greenOverload).values(fresh).run();
  return fresh;
}

export function overloadView(c: Pick<CharacterRow, 'id' | 'name'>): GmOverload {
  const r = rowFor(c.id);
  return { characterId: c.id, name: c.name, value: r.value, eyesAt: r.eyesAt, skinAt: r.skinAt, sign: signOf(r) };
}

export function changeOverload(
  c: Pick<CharacterRow, 'id' | 'name'>,
  ch: { delta?: 1 | -1; reset?: boolean; eyesAt?: number; skinAt?: number },
): GmOverload {
  const r = rowFor(c.id);
  let value = r.value;
  if (ch.reset) value = 0;
  else if (ch.delta) value = Math.max(0, Math.min(99, value + ch.delta));
  const eyesAt = ch.eyesAt ?? r.eyesAt;
  const skinAt = Math.max(eyesAt + 1, ch.skinAt ?? r.skinAt);
  db.update(schema.greenOverload)
    .set({ value, eyesAt, skinAt, updatedAt: Date.now() })
    .where(eq(schema.greenOverload.characterId, c.id))
    .run();
  return overloadView(c);
}
