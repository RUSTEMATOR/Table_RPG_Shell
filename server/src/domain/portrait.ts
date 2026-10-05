import { sha256 } from '../auth/tokens.ts';
import type { CharDoc } from './character.ts';

// Портрет персонажа живёт в документе как dataUri (как в артефакте). Наружу — отдельным ответом по адресу с версией,
// чтобы не возить сотню килобайт в каждом character:updated.

type Image = NonNullable<CharDoc['image']>;

export function portraitUrl(characterId: string, image: Image): string {
  return `/api/characters/${characterId}/portrait?v=${sha256(image.dataUri).slice(0, 12)}`;
}

export function portraitBytes(image: Image): { type: string; body: Buffer } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image.dataUri);
  return m ? { type: m[1]!, body: Buffer.from(m[2]!, 'base64') } : null;
}
