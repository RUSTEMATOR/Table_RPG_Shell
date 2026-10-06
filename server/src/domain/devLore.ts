import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { MAP_IDS, RUMOR_KINDS, SPOT_KINDS } from '@zg/shared';
import { db, schema } from '../db/client.ts';
import { SERVER_ROOT } from '../paths.ts';
import { GM_MARKER } from '../visibility/guard.ts';
import { ensureMaps, placeRows, updatePlace } from './maps.ts';
import { addPresence, createRumor, createSpot, spotRows, updatePresence } from './places.ts';

// Черновики описаний мест (этап 27) — только для разработки: npm run seed:dev и демо-комната. В прод не идут.
// Во всех мастерских полях — маркер СЕКРЕТ-МАСТЕРА; у столиц ещё скрытое место в городе и скрытый слух с маркером
// в самом тексте — их появление у игрока или стола значит утечку.

const Lore = z.object({
  description: z.string(),
  ruler: z.string().optional(),
  faction: z.string().optional(),
  population: z.string().optional(),
  note: z.string().optional(),
  spots: z.array(z.object({ kind: z.enum(SPOT_KINDS), name: z.string(), description: z.string(), note: z.string().optional() })).optional(),
  rumors: z.array(z.object({ kind: z.enum(RUMOR_KINDS), text: z.string(), note: z.string().optional() })).optional(),
});

const FILE = join(SERVER_ROOT, 'src', 'maps', 'lore', 'dev-places.json');
const CAPITALS = new Set(['razd-5', 'razd-21', 'frozen-8']);

/**
 * Наполнить места комнаты черновиками. Повторный запуск ничего не дублирует: заполняется только пустое описание,
 * места в городе и слухи — только у места, где их ещё нет. Возвращает число наполненных мест.
 */
export function applyDevLore(roomId: string): number {
  ensureMaps(roomId);
  const raw = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, unknown>;
  const M = GM_MARKER;
  let n = 0;
  for (const mapId of MAP_IDS) {
    for (const p of placeRows(roomId, mapId)) {
      if (!p.key || !(p.key in raw)) continue;
      const l = Lore.safeParse(raw[p.key]);
      if (!l.success) throw new Error(`dev-places.json: ${p.key}: ${l.error.issues[0]?.message}`);
      const v = l.data;
      if (!p.description)
        updatePlace(p, {
          description: v.description,
          ruler: v.ruler ?? '',
          faction: v.faction ?? '',
          population: v.population ?? '',
          ...(p.noteGm ? {} : { noteGm: `${M}: ${v.note ?? 'заметка к месту'}` }),
        });
      if (spotRows(p.id).length === 0) {
        for (const s of v.spots ?? [])
          createSpot(p, { kind: s.kind, name: s.name, description: s.description, visible: true, noteGm: `${M}: ${s.note ?? 'заметка к месту в городе'}` });
        if (CAPITALS.has(p.key))
          createSpot(p, { kind: 'other', name: `${M}: тайная комната`, description: `${M}: описание скрытого места`, visible: false, noteGm: `${M}: скрыто` });
        (v.rumors ?? []).forEach((r, i) => createRumor(p, { kind: r.kind, text: r.text, visible: i === 0, noteGm: `${M}: ${r.note ?? 'правда ли это'}` }));
        if (CAPITALS.has(p.key)) createRumor(p, { kind: 'rumor', text: `${M}: скрытый слух`, visible: false, noteGm: `${M}: скрыто` });
      }
      n++;
    }
  }
  return n;
}

/** Противник в городе: открытый — у моста Oroak, если есть такой противник и такое место в городе. */
export function placeNpcAtBridge(roomId: string, npcId: string): void {
  const oroak = placeRows(roomId, 'razdolye').find((p) => p.key === 'razd-4');
  if (!oroak) return;
  const has = db
    .select({ id: schema.mapPresence.id })
    .from(schema.mapPresence)
    .where(and(eq(schema.mapPresence.placeId, oroak.id), eq(schema.mapPresence.npcId, npcId)))
    .get();
  if (has) return;
  const bridge = spotRows(oroak.id).find((s) => s.kind === 'gate');
  const x = addPresence(oroak, npcId, bridge?.id ?? null, 'хозяин Старого моста');
  updatePresence(x, { visible: true });
}
