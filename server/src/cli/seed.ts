import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { and, eq, ne } from 'drizzle-orm';
import { newId } from '../auth/tokens.ts';
import { DEMO_CODE } from '../domain/demo.ts';
import { db, schema, sqlite } from '../db/client.ts';
import { setReveal, setStage } from '../domain/cards.ts';
import type { CharDoc } from '../domain/character.ts';
import { draftToChar } from '../domain/charDoc.ts';
import { roll, rollExtra } from '../domain/randomizer.ts';
import { createNpc } from '../domain/npc.ts';
import { insertCharacter } from '../domain/repo.ts';
import { createSheetEntry, listSheet } from '../domain/sheet.ts';
import { GM_MARKER } from '../visibility/guard.ts';
import { createPlace, ensureMaps, placeRows, regionRows, setParty, updatePlace, updateRegion } from '../domain/maps.ts';
import type { MapId } from '@zg/shared';
import { MIGRATIONS_DIR } from '../paths.ts';
import { applyDevLore, placeNpcAtBridge } from '../domain/devLore.ts';

// npm run seed — тестовые персонажи. Повторный запуск ничего не дублирует.
// Во всех мастерских полях — маркер СЕКРЕТ-МАСТЕРА: его появление у игрока или стола — блокирующий дефект.

migrate(db, { migrationsFolder: MIGRATIONS_DIR });

const room = db.select().from(schema.room).where(ne(schema.room.code, DEMO_CODE)).get(); // демо-комната гостей — не наша
if (!room) throw new Error('Комнаты ещё нет: запустите npm run setup');
const players = db
  .select()
  .from(schema.member)
  .where(and(eq(schema.member.roomId, room.id), eq(schema.member.role, 'player')))
  .all();
const ownedBy = new Set(
  db
    .select({ o: schema.character.ownerMemberId })
    .from(schema.character)
    .all()
    .map((r) => r.o),
);
const freePlayers = players.filter((p) => !ownedBy.has(p.id));

const M = GM_MARKER;
const exists = (name: string) =>
  !!db
    .select()
    .from(schema.character)
    .where(and(eq(schema.character.roomId, room.id), eq(schema.character.name, name)))
    .get();

function markSecrets(doc: CharDoc) {
  doc.notes = `${M}: заметки мастера о персонаже «${doc.name}».`;
  doc.personal = {
    at: Date.now(),
    slots: Object.fromEntries(doc.slots.map((s) => [s.traitId, { signs: `${M}: признаки`, reveals: [`${M}: первое проявление`], hooks: [`${M}: крючок`] }])),
  };
  doc.summary = {
    gm: { text: `${M}: сводка для мастера.`, at: Date.now(), edited: false },
    player: { text: `${M}: неопубликованное вступление.`, at: Date.now(), edited: false, show: false },
  };
  doc.power = { value: 40, history: [{ t: Date.now(), from: 10, to: 40, note: `${M}: почему вырос` }] };
}

const created: string[] = [];

// 1. Попаданец с параметрами по умолчанию из рандомизатора (сид 2026): удобно сверять с артефактом.
const A = 'Тест: Пример (сид 2026)';
if (!exists(A)) {
  const draft = roll({ seed: '2026', name: A, pronoun: '', source: 'real', universe: '', arch: 'warrior', patron: false, profession: '', professionText: '' });
  const id = newId();
  const doc = draftToChar(draft, id);
  markSecrets(doc);
  // Раскрыты две черты, одна намекнута, остальные скрыты.
  setStage(doc.slots[0]!, 2);
  setReveal(doc.slots[0]!, { trait: true, stages: 2 });
  setStage(doc.slots[2]!, 1);
  setReveal(doc.slots[2]!, { trait: true, stages: 1, price: true });
  setReveal(doc.slots[3]!, { hint: 'Иногда вещи рядом с тобой ведут себя странно.' });
  insertCharacter({ id, roomId: room.id, ownerMemberId: freePlayers.shift()?.id ?? null, kind: 'popadanets', name: A, publicBio: '' }, doc);
  created.push(A);
}

// 2. Попаданец, у которого все шесть черт скрыты (проверка T2.4: ни массива, ни счётчика).
const B = 'Тест: всё скрыто (сид 777001)';
if (!exists(B)) {
  const draft = rollExtra(
    roll({ seed: '777001', name: B, pronoun: 'она', source: 'fantasy', universe: 'witcher', arch: 'civilian', patron: true, profession: 'doctor', professionText: '' }),
  );
  const id = newId();
  const doc = draftToChar(draft, id);
  markSecrets(doc);
  insertCharacter({ id, roomId: room.id, ownerMemberId: freePlayers.shift()?.id ?? null, kind: 'popadanets', name: B, publicBio: '' }, doc);
  created.push(B);
}

// 3. Местный.
const C = 'Тест: местная травница';
if (!exists(C)) {
  const id = newId();
  const now = Date.now();
  const doc: CharDoc = {
    id,
    name: C,
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
    power: { value: 20, history: [{ t: now, from: 10, to: 20, note: `${M}: стартовый уровень` }] },
  };
  insertCharacter(
    { id, roomId: room.id, ownerMemberId: freePlayers.shift()?.id ?? null, kind: 'local', name: C, publicBio: 'Травница из деревни у края леса. Знает каждую тропу.' },
    doc,
  );
  created.push(C);
}

// 4. Лист «Примера»: видимые и скрытые записи. В скрытых маркер и в тексте, и в заметке мастера.
const aRow = db
  .select()
  .from(schema.character)
  .where(and(eq(schema.character.roomId, room.id), eq(schema.character.name, A)))
  .get();
if (aRow && listSheet(aRow.id).length === 0) {
  createSheetEntry(aRow.id, { kind: 'item', title: 'Походный нож', text: 'Тупится о зелень.', textGm: `${M}: нож заговорён`, visible: true }, 'gm');
  createSheetEntry(aRow.id, { kind: 'item', title: `${M}: подброшенный амулет`, text: `${M}: игрок о нём не знает`, textGm: '', visible: false }, 'gm');
  createSheetEntry(aRow.id, { kind: 'condition', title: `${M}: проклятие`, text: `${M}: действует с полуночи`, textGm: '', visible: false }, 'gm');
  createSheetEntry(aRow.id, { kind: 'relation', title: 'Травница', text: 'Приютила на первую ночь.', textGm: `${M}: следит по просьбе старосты`, visible: true }, 'gm');
  created.push(`лист «${A}»`);
}

// 5. Противник в библиотеке: заметки мастера с маркером, на стол уходят только имя и портрет.
const N = 'Тест: Тролль';
if (
  !db
    .select()
    .from(schema.npc)
    .where(and(eq(schema.npc.roomId, room.id), eq(schema.npc.name, N)))
    .get()
) {
  createNpc(room.id, { name: N, power: 400, notes: `${M}: боится огня, под мостом прячет клад.` });
  created.push(N);
}

// 6. Карты: открыты Раздолье на карте мира, Западное королевство, Сумеречный лес и несколько мест.
// Скрытое место с маркером в имени и note_gm с маркером у открытого и скрытого — у игрока и стола их быть не должно.
const SECRET_PLACE = `${M}: тайник контрабандистов`;
if (
  !db
    .select()
    .from(schema.mapPlace)
    .where(and(eq(schema.mapPlace.roomId, room.id), eq(schema.mapPlace.name, SECRET_PLACE)))
    .get()
) {
  ensureMaps(room.id);
  const open = (mapId: MapId, keys: string[]) =>
    regionRows(room.id, mapId)
      .filter((r) => keys.includes(r.key))
      .forEach((r) => updateRegion(r, { visible: true, noteGm: `${M}: заметка к региону` }));
  open('world', ['razdolye']);
  open('razdolye', ['west', 'twilight']);
  const places = placeRows(room.id, 'razdolye');
  const show = ['Marblewolf', 'Oroak', 'Eriflower', 'Magewald', 'Castlefair'];
  for (const p of places) {
    if (show.includes(p.name)) updatePlace(p, { visible: true, noteGm: `${M}: кто здесь на самом деле правит` });
    else if (p.name === 'Havenwall') updatePlace(p, { noteGm: `${M}: тайный союз с Marblewolf` });
  }
  const villages = places.filter((p) => p.kind === 'village' && p.x < 700).slice(0, 3);
  villages.forEach((p, i) => updatePlace(p, { visible: true, name: ['Овражки', 'Ключи', 'Подлесье'][i] ?? '' }));
  createPlace(room.id, 'razdolye', { name: SECRET_PLACE, kind: 'mark', x: 520, y: 700, side: 'r', subtitle: `${M}: подзаголовок`, visible: false, noteGm: `${M}: охраняют двое` });
  const mw = places.find((p) => p.name === 'Marblewolf');
  if (mw) setParty(room.id, { mapId: 'razdolye', x: mw.x - 40, y: mw.y + 60, visible: true });
  created.push('карты: Раздолье частично открыто, партия у Marblewolf');
}

// 7. Города (этап 27): черновики описаний, мест в городе и слухов; тролль — «кто здесь» у моста Oroak.
const lore = applyDevLore(room.id);
const troll = db
  .select()
  .from(schema.npc)
  .where(and(eq(schema.npc.roomId, room.id), eq(schema.npc.name, N)))
  .get();
if (troll) placeNpcAtBridge(room.id, troll.id);
if (lore) created.push(`города: описаны ${lore} мест (новое — только там, где пусто)`);

console.log(created.length ? `Созданы: ${created.join('; ')}` : 'Тестовые персонажи уже есть, ничего не создано.');
sqlite.close();
