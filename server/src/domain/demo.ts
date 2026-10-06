import { and, eq } from 'drizzle-orm';
import { DEMO_ROOM_CODE } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { config } from '../config.ts';
import { db, schema } from '../db/client.ts';
import { setReveal, setStage } from './cards.ts';
import type { CharDoc } from './character.ts';
import { draftToChar } from './charDoc.ts';
import { roll, rollExtra } from './randomizer.ts';
import { createNpc, setNpcFigure } from './npc.ts';
import { insertCharacter } from './repo.ts';
import { createSheetEntry } from './sheet.ts';
import { createScene, setShown } from './scenes.ts';
import { addToken, ensureMaps, pieces, placeRows, regionRows, setParty, updatePlace, updateRegion } from './maps.ts';
import { GM_MARKER } from '../visibility/guard.ts';

// Демо-комната для гостей: посмотреть интерфейс мастера, игрока и стола без приглашений и PIN.
// Только в разработке (NODE_ENV=development, в том числе QA-адрес) — в проде её нет и гостевой вход выключен.
// Комната отдельная: все запросы и события и так ограничены комнатой сессии, рабочая dev-комната гостям не видна.
// У гостевых участников нет PIN и пароля: войти по коду комнаты нельзя, только кнопкой «Войти гостем».
// ИИ (Jev, Claude) в демо-комнате выключен: адрес QA открыт в интернет, платные вызовы гостям ни к чему.

export const DEMO_CODE = DEMO_ROOM_CODE;
export const demoEnabled = () => config.isDev;

let demoRoomId: string | null | undefined;
export function isDemoRoom(roomId: string): boolean {
  if (!config.isDev) return false;
  if (demoRoomId === undefined) demoRoomId = db.select({ id: schema.room.id }).from(schema.room).where(eq(schema.room.code, DEMO_CODE)).get()?.id ?? null;
  return roomId === demoRoomId;
}

export type GuestRole = 'gm' | 'player' | 'table';
const NAMES: Record<GuestRole, string> = { gm: 'Гость-мастер', player: 'Гость-игрок', table: 'Гостевой стол' };

/** Участник демо-комнаты для гостя с этой ролью. Комнату при первом вызове создаёт и наполняет. */
export function demoMember(role: GuestRole): string {
  const roomId = ensureDemoRoom();
  const m = db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.roomId, roomId), eq(schema.member.role, role), eq(schema.member.name, NAMES[role])))
    .get();
  if (!m) throw new Error('Демо-комната без гостевого участника');
  return m.id;
}

function ensureDemoRoom(): string {
  const existing = db.select({ id: schema.room.id }).from(schema.room).where(eq(schema.room.code, DEMO_CODE)).get();
  if (existing) return existing.id;
  const roomId = newId();
  const now = Date.now();
  const member = (role: GuestRole, name: string) => {
    const id = newId();
    db.insert(schema.member).values({ id, roomId, role, name, secretHash: null, createdAt: now }).run();
    return id;
  };
  db.insert(schema.room).values({ id: roomId, code: DEMO_CODE, name: 'Демо-комната', createdAt: now }).run();
  member('gm', NAMES.gm);
  const guest = member('player', NAMES.player);
  const nika = member('player', 'Ника');
  member('player', 'Тимур');
  member('table', NAMES.table);
  demoRoomId = roomId;
  seedDemo(roomId, guest, nika);
  return roomId;
}

const M = GM_MARKER;
function markSecrets(doc: CharDoc) {
  doc.notes = `${M}: заметки мастера о персонаже «${doc.name}».`;
  doc.personal = {
    at: Date.now(),
    slots: Object.fromEntries(doc.slots.map((s) => [s.traitId, { signs: `${M}: признаки`, reveals: [`${M}: первое проявление`], hooks: [`${M}: крючок`] }])),
  };
}

/** Тестовые данные: два попаданца (у гостя и у Ники), местная, противник, сцена на столе, вопрос в дневнике, открытые части карт. */
function seedDemo(roomId: string, guest: string, nika: string) {
  const now = Date.now();
  // Персонаж гостя: две черты раскрыты, одна намекнута, остальное скрыто.
  const a = draftToChar(
    roll({ seed: '4242', name: 'Мира', pronoun: 'она', source: 'fantasy', universe: 'witcher', arch: 'warrior', patron: false, profession: '', professionText: '' }),
    newId(),
  );
  markSecrets(a);
  if (a.slots[0]) {
    setStage(a.slots[0], 2);
    setReveal(a.slots[0], { trait: true, stages: 2 });
  }
  if (a.slots[2]) {
    setStage(a.slots[2], 1);
    setReveal(a.slots[2], { trait: true, stages: 1, price: true });
  }
  if (a.slots[3]) setReveal(a.slots[3], { hint: 'Иногда вещи рядом с тобой ведут себя странно.' });
  a.figure = {
    v: 1,
    body: 'female',
    skin: 'light',
    parts: {
      body: { id: 'human' },
      head: { id: 'human_female' },
      hair: { id: 'long', color: 'chestnut' },
      torso: { id: 'longsleeve', color: 'forest' },
      armour: { id: 'leather', color: 'brown' },
      legs: { id: 'pants', color: 'walnut' },
      feet: { id: 'boots', color: 'leather' },
      weapon: { id: 'longsword' },
    },
  };
  insertCharacter({ id: a.id, roomId, ownerMemberId: guest, kind: 'popadanets', name: a.name, publicBio: '' }, a);
  createSheetEntry(a.id, { kind: 'item', title: 'Походный нож', text: 'Тупится о зелень.', textGm: `${M}: нож заговорён`, visible: true }, 'gm');
  createSheetEntry(a.id, { kind: 'relation', title: 'Травница', text: 'Приютила на первую ночь.', textGm: `${M}: следит по просьбе старосты`, visible: true }, 'gm');
  createSheetEntry(a.id, { kind: 'item', title: `${M}: подброшенный амулет`, text: '', textGm: '', visible: false }, 'gm');

  const b = draftToChar(
    rollExtra(
      roll({ seed: '777001', name: 'Ведьмачка', pronoun: 'она', source: 'fantasy', universe: 'witcher', arch: 'civilian', patron: true, profession: 'doctor', professionText: '' }),
    ),
    newId(),
  );
  markSecrets(b);
  b.figure = {
    v: 1,
    body: 'female',
    skin: 'olive',
    parts: {
      body: { id: 'human' },
      head: { id: 'human_female' },
      hair: { id: 'long', color: 'platinum' },
      torso: { id: 'longsleeve', color: 'charcoal' },
      cape: { id: 'solid', color: 'black' },
      legs: { id: 'pants', color: 'black' },
      feet: { id: 'boots', color: 'black' },
      weapon: { id: 'bow', color: 'dark' },
    },
  };
  insertCharacter({ id: b.id, roomId, ownerMemberId: nika, kind: 'popadanets', name: b.name, publicBio: '' }, b);

  const local: CharDoc = {
    id: newId(),
    name: 'Травница Ольха',
    source: 'other',
    universe: '',
    arch: 'none',
    patron: false,
    seed: '',
    createdAt: now,
    updatedAt: now,
    notes: `${M}: на самом деле она дочь зелени.`,
    slots: [],
    revealedAt: null,
    pronoun: 'она',
    power: { value: 20, history: [] },
  };
  insertCharacter({ id: local.id, roomId, ownerMemberId: null, kind: 'local', name: local.name, publicBio: 'Травница из деревни у края леса.' }, local);

  const troll = createNpc(roomId, { name: 'Тролль Каменного брода', power: 400, notes: `${M}: боится огня.` });
  setNpcFigure(troll, {
    v: 1,
    body: 'male',
    skin: 'green',
    parts: { body: { id: 'human' }, head: { id: 'troll' }, legs: { id: 'pants', color: 'brown' }, weapon: { id: 'mace' } },
  });
  const scene = createScene(roomId, { title: 'Мост через Зелёный ручей', textPublic: 'Туман стелется над водой. На том берегу кто-то ждёт.', textGm: `${M}: под мостом тролль` });
  setShown(roomId, scene.id);

  db.insert(schema.diaryEntry)
    .values({
      id: newId(),
      roomId,
      memberId: nika,
      characterId: b.id,
      text: 'Можно ли попросить у хранителя рощи семена, не называя своего имени?',
      private: false,
      request: true,
      requestState: 'open',
      reply: '',
      createdAt: now,
      updatedAt: now,
    })
    .run();

  ensureMaps(roomId);
  regionRows(roomId, 'world')
    .filter((r) => r.key === 'razdolye')
    .forEach((r) => updateRegion(r, { visible: true }));
  regionRows(roomId, 'razdolye')
    .filter((r) => r.key === 'west' || r.key === 'twilight')
    .forEach((r) => updateRegion(r, { visible: true, noteGm: `${M}: заметка к региону` }));
  const places = placeRows(roomId, 'razdolye');
  for (const p of places) if (['Marblewolf', 'Oroak', 'Eriflower', 'Magewald', 'Castlefair'].includes(p.name)) updatePlace(p, { visible: true, noteGm: `${M}: кто здесь правит` });
  const mw = places.find((p) => p.name === 'Marblewolf');
  if (mw) setParty(roomId, { mapId: 'razdolye', x: mw.x - 40, y: mw.y + 60, visible: true });
  // Фигурки: двое персонажей у столицы, тролль у брода — пока скрыт.
  if (mw) {
    const all = pieces(roomId);
    const at = (refId: string, dx: number, dy: number, visible: boolean) => {
      const p = all.find((x) => x.refId === refId);
      if (p) addToken(roomId, 'razdolye', p, mw.x + dx, mw.y + dy, visible);
    };
    at(a.id, -70, 40, true);
    at(b.id, -10, 55, true);
    at(troll.id, 120, -60, false);
  }
}
