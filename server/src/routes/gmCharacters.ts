import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { RollParamsSchema, type Catalog, type GmCharacterListItem, HumanFigureSchema } from '@zg/shared';
import { requireGm } from '../auth/requireGm.ts';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { ARCHS, PROFESSIONS, SOURCES, TIERS, TIER_KEYS, UNIVERSES } from '../domain/data.ts';
import { POWER_MAX, powerClamp, powerOf } from '../domain/cards.ts';
import { HIST_MAX, STAGE_NAMES, normPronoun, normRevealed, type CharDoc } from '../domain/character.ts';
import { ImportError, draftToChar, importChar } from '../domain/charDoc.ts';
import { applyPick, newSeed, removeExtra, rerollSlot, roll, rollExtra } from '../domain/randomizer.ts';
import { insertCharacter, listCharacters, loadCharacter, saveDoc } from '../domain/repo.ts';
import { characterView, draftView } from '../domain/views.ts';
import { notifyCharacterChanged } from '../realtime/notify.ts';
import { TRAIT_LIST, traitDesc } from '../domain/traits.ts';
import { DraftSchema, normalizeDraft } from './draft.ts';

const catalog: Catalog = {
  sources: SOURCES.map(([key, label]) => ({ key, label })),
  archs: ARCHS.map(([key, label]) => ({ key, label })),
  universes: Object.entries(UNIVERSES).map(([key, u]) => ({ key, label: u.name, genre: u.genre })),
  professions: Object.entries(PROFESSIONS).map(([key, p]) => ({ key, label: p.label })),
  profArchs: ['none', 'civilian'],
  tiers: TIER_KEYS.map((k) => ({ key: k, label: TIERS[k] })),
  stageNames: [...STAGE_NAMES],
};

const bad = (reply: FastifyReply, error = 'bad_request') => reply.code(400).send({ error });

function draftFrom(body: unknown) {
  const p = z.object({ draft: DraftSchema }).passthrough().safeParse(body);
  return p.success ? normalizeDraft(p.data.draft) : null;
}

/** Игрок комнаты, которому можно отдать персонажа (у одного игрока — один персонаж). */
function checkOwner(roomId: string, ownerMemberId: string | null, characterId: string | null): string | null {
  if (ownerMemberId === null) return null;
  const m = db
    .select()
    .from(schema.member)
    .where(and(eq(schema.member.id, ownerMemberId), eq(schema.member.roomId, roomId)))
    .get();
  if (!m || m.role !== 'player') return 'owner_invalid';
  const taken = db.select().from(schema.character).where(eq(schema.character.ownerMemberId, ownerMemberId)).get();
  if (taken && taken.id !== characterId) return 'owner_taken';
  return null;
}

const OwnerSchema = z.string().min(1).max(64).nullable().optional();

export async function gmCharacterRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  app.get('/api/gm/catalog', async () => catalog);

  // ---- Бросок: черновик живёт на экране мастера до «Сохранить» ----

  app.post('/api/gm/roll', async (request, reply) => {
    const p = RollParamsSchema.safeParse((request.body as { params?: unknown } | null)?.params);
    if (!p.success) return bad(reply);
    const params = { ...p.data, seed: p.data.seed || newSeed() };
    if (!SOURCES.some((s) => s[0] === params.source)) return bad(reply, 'bad_source');
    if (!ARCHS.some((a) => a[0] === params.arch)) return bad(reply, 'bad_arch');
    if (params.universe && !UNIVERSES[params.universe]) return bad(reply, 'bad_universe');
    return draftView(roll(params));
  });

  app.post('/api/gm/roll/reroll', async (request, reply) => {
    const draft = draftFrom(request.body);
    const i = Number((request.body as { index?: unknown })?.index);
    if (!draft || !Number.isInteger(i) || !draft.slots[i]) return bad(reply);
    return draftView(rerollSlot(draft, i));
  });

  app.post('/api/gm/roll/extra', async (request, reply) => {
    const draft = draftFrom(request.body);
    if (!draft) return bad(reply);
    return draftView(rollExtra(draft));
  });

  app.post('/api/gm/roll/remove', async (request, reply) => {
    const draft = draftFrom(request.body);
    const i = Number((request.body as { index?: unknown })?.index);
    if (!draft || !Number.isInteger(i)) return bad(reply);
    return draftView(removeExtra(draft, i));
  });

  app.post('/api/gm/roll/pick', async (request, reply) => {
    const draft = draftFrom(request.body);
    const b = request.body as { index?: unknown; traitId?: unknown };
    const index = b.index === null ? null : Number(b.index);
    if (!draft || typeof b.traitId !== 'string' || (index !== null && !Number.isInteger(index))) return bad(reply);
    return draftView(applyPick(draft, index, b.traitId));
  });

  app.get<{ Querystring: { q?: string; cat?: string } }>('/api/gm/traits', async (request) => {
    const q = String(request.query.q ?? '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .trim();
    const cat = String(request.query.cat ?? '');
    return TRAIT_LIST.filter((t) => (cat ? t.cat === cat : t.cat !== 'class' && t.cat !== 'green'))
      .filter((t) => !q || `${t.name} ${traitDesc(t)} ${t.src ?? ''}`.toLowerCase().replace(/ё/g, 'е').includes(q))
      .slice(0, 50)
      .map((t) => ({ id: t.id, name: t.name, cat: t.cat, tier: t.tier, d: traitDesc(t), src: t.src ?? '' }));
  });

  // ---- Персонажи ----

  app.post('/api/gm/characters', async (request, reply) => {
    const draft = draftFrom(request.body);
    const owner = OwnerSchema.safeParse((request.body as { ownerMemberId?: unknown })?.ownerMemberId ?? null);
    if (!draft || !owner.success) return bad(reply);
    const roomId = request.auth!.room.id;
    const ownerErr = checkOwner(roomId, owner.data ?? null, null);
    if (ownerErr) return reply.code(409).send({ error: ownerErr });
    const id = newId();
    const doc = draftToChar(draft, id);
    insertCharacter({ id, roomId, ownerMemberId: owner.data ?? null, kind: 'popadanets', name: doc.name || 'Без имени', publicBio: '' }, doc);
    const lc = loadCharacter(roomId, id)!;
    notifyCharacterChanged(roomId, lc);
    return { id };
  });

  const LocalSchema = z.strictObject({
    name: z.string().trim().min(1).max(120),
    pronoun: z.enum(['', 'он', 'она', 'они']).default(''),
    publicBio: z.string().max(4000).default(''),
    notes: z.string().max(20000).default(''),
    ownerMemberId: OwnerSchema,
  });

  app.post('/api/gm/characters/local', async (request, reply) => {
    const b = LocalSchema.safeParse(request.body);
    if (!b.success) return bad(reply);
    const roomId = request.auth!.room.id;
    const ownerErr = checkOwner(roomId, b.data.ownerMemberId ?? null, null);
    if (ownerErr) return reply.code(409).send({ error: ownerErr });
    const id = newId();
    const now = Date.now();
    const doc: CharDoc = {
      id,
      name: b.data.name,
      source: 'other',
      universe: '',
      arch: 'none',
      patron: false,
      seed: '',
      createdAt: now,
      updatedAt: now,
      notes: b.data.notes,
      slots: [],
      revealedAt: null,
      ...(normPronoun(b.data.pronoun) ? { pronoun: normPronoun(b.data.pronoun) } : {}),
    };
    insertCharacter({ id, roomId, ownerMemberId: b.data.ownerMemberId ?? null, kind: 'local', name: b.data.name, publicBio: b.data.publicBio }, doc);
    notifyCharacterChanged(roomId, loadCharacter(roomId, id)!);
    return { id };
  });

  app.post('/api/gm/import', async (request, reply) => {
    const b = request.body as { json?: unknown; ownerMemberId?: unknown } | null;
    let obj: unknown = b?.json;
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch {
        return reply.code(400).send({ error: 'bad_json', message: 'Это не JSON' });
      }
    }
    const owner = OwnerSchema.safeParse(b?.ownerMemberId ?? null);
    if (!owner.success) return bad(reply);
    const roomId = request.auth!.room.id;
    const ownerErr = checkOwner(roomId, owner.data ?? null, null);
    if (ownerErr) return reply.code(409).send({ error: ownerErr });
    const id = newId();
    let doc: CharDoc;
    try {
      doc = importChar(obj, id);
    } catch (e) {
      if (e instanceof ImportError) return reply.code(400).send({ error: 'bad_import', message: e.message });
      throw e;
    }
    insertCharacter({ id, roomId, ownerMemberId: owner.data ?? null, kind: 'popadanets', name: doc.name || 'Без имени', publicBio: '' }, doc);
    notifyCharacterChanged(roomId, loadCharacter(roomId, id)!);
    return { id };
  });

  app.get('/api/gm/characters', async (request) => {
    const members = new Map(
      db
        .select()
        .from(schema.member)
        .where(eq(schema.member.roomId, request.auth!.room.id))
        .all()
        .map((m) => [m.id, m.name]),
    );
    return listCharacters(request.auth!.room.id)
      .map(({ row, doc }): GmCharacterListItem => {
        const rv = doc.slots.map((s) => normRevealed(s.revealed));
        return {
          id: row.id,
          kind: row.kind,
          name: row.name,
          ownerName: row.ownerMemberId ? (members.get(row.ownerMemberId) ?? null) : null,
          slots: doc.slots.length,
          revealed: rv.filter((r) => r.trait).length,
          hinted: rv.filter((r) => !r.trait && r.hint.trim()).length,
          updatedAt: row.updatedAt,
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  });

  app.get<{ Params: { id: string } }>('/api/gm/characters/:id', async (request, reply) => {
    const lc = loadCharacter(request.auth!.room.id, request.params.id);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    return characterView(lc);
  });

  app.get<{ Params: { id: string } }>('/api/gm/characters/:id/export', async (request, reply) => {
    const lc = loadCharacter(request.auth!.room.id, request.params.id);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    reply.header('content-disposition', `attachment; filename="character-${lc.row.id}.json"`);
    return lc.doc;
  });

  const MetaSchema = z.strictObject({
    name: z.string().trim().min(1).max(120).optional(),
    pronoun: z.enum(['', 'он', 'она', 'они']).optional(),
    publicBio: z.string().max(4000).optional(),
    notes: z.string().max(20000).optional(),
    ownerMemberId: OwnerSchema,
    /** «Оформление» карточки: '' — авто (вселенная, иначе жанр), иначе ключ жанра или вселенной. */
    cardTheme: z
      .string()
      .max(40)
      .refine((k) => k === '' || SOURCES.some(([s]) => s === k) || Object.prototype.hasOwnProperty.call(UNIVERSES, k))
      .optional(),
  });

  // Фигурка персонажа (этап 23): мастер может собрать или поправить любую. null — убрать. Персонаж — всегда человек (существа — у противников).
  app.post<{ Params: { id: string } }>('/api/gm/characters/:id/figure', async (request, reply) => {
    const b = HumanFigureSchema.nullable().safeParse(request.body);
    if (!b.success) return bad(reply);
    const roomId = request.auth!.room.id;
    const lc = loadCharacter(roomId, request.params.id);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    if (b.data) lc.doc.figure = b.data;
    else delete lc.doc.figure;
    saveDoc(lc.row.id, lc.doc);
    const fresh = loadCharacter(roomId, lc.row.id)!;
    notifyCharacterChanged(roomId, fresh);
    return characterView(fresh);
  });

  app.post<{ Params: { id: string } }>('/api/gm/characters/:id/meta', async (request, reply) => {
    const b = MetaSchema.safeParse(request.body);
    if (!b.success) return bad(reply);
    const roomId = request.auth!.room.id;
    const lc = loadCharacter(roomId, request.params.id);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    const prevOwner = lc.row.ownerMemberId;
    const rowPatch: Parameters<typeof saveDoc>[2] = {};
    if (b.data.ownerMemberId !== undefined) {
      const err = checkOwner(roomId, b.data.ownerMemberId, lc.row.id);
      if (err) return reply.code(409).send({ error: err });
      rowPatch.ownerMemberId = b.data.ownerMemberId;
    }
    if (b.data.name !== undefined) {
      rowPatch.name = b.data.name;
      lc.doc.name = b.data.name;
    }
    if (b.data.publicBio !== undefined) rowPatch.publicBio = b.data.publicBio;
    if (b.data.notes !== undefined) lc.doc.notes = b.data.notes;
    if (b.data.cardTheme !== undefined) {
      if (b.data.cardTheme) lc.doc.cardTheme = b.data.cardTheme;
      else delete lc.doc.cardTheme;
    }
    if (b.data.pronoun !== undefined) {
      if (normPronoun(b.data.pronoun)) lc.doc.pronoun = normPronoun(b.data.pronoun);
      else delete lc.doc.pronoun;
    }
    saveDoc(lc.row.id, lc.doc, rowPatch);
    const fresh = loadCharacter(roomId, lc.row.id)!;
    notifyCharacterChanged(roomId, fresh, prevOwner);
    return characterView(fresh);
  });

  const PowerSchema = z.strictObject({
    value: z.number().int().min(1).max(POWER_MAX).optional(),
    note: z.string().max(200).default(''),
    show: z.boolean().optional(),
  });

  app.post<{ Params: { id: string } }>('/api/gm/characters/:id/power', async (request, reply) => {
    const b = PowerSchema.safeParse(request.body);
    if (!b.success) return bad(reply);
    const roomId = request.auth!.room.id;
    const lc = loadCharacter(roomId, request.params.id);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    if (b.data.value !== undefined) {
      const from = powerOf(lc.doc);
      const to = powerClamp(b.data.value);
      if (to !== from) {
        const hist = lc.doc.power?.history ?? [];
        lc.doc.power = { value: to, history: hist.concat([{ t: Date.now(), from, to, note: b.data.note }]).slice(-HIST_MAX) };
      }
    }
    if (b.data.show !== undefined) {
      if (b.data.show) lc.doc.showPower = true;
      else delete lc.doc.showPower;
    }
    saveDoc(lc.row.id, lc.doc);
    notifyCharacterChanged(roomId, lc);
    return characterView(lc);
  });
}
