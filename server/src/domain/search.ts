import { eq } from 'drizzle-orm';
import { DOWNTIME_KIND_LABELS, MOMENT_KIND_LABELS, type DowntimeKind, type GmSearchHit, type MomentKind, type SearchKind } from '@zg/shared';
import { db, schema, sqlite } from '../db/client.ts';
import { parseDoc } from './charDoc.ts';

// Поиск мастера (этап 54): FTS5 по всему, что видит мастер. Индекс — производные данные: таблица создаётся при запуске,
// комната пересобирается целиком, когда меняется её «подпись» (число строк и последнее время правки по источникам).
// НЕ индексируются: записи «только для меня» (правило 7), заметки игроков о знакомых (только игроку).

sqlite.exec(
  "CREATE VIRTUAL TABLE IF NOT EXISTS search_doc USING fts5(room_id UNINDEXED, kind UNINDEXED, ref UNINDEXED, link UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2')",
);

type Doc = { kind: SearchKind; ref: string; link: string; title: string; body: string };
const built = new Map<string, string>();

/** Подпись комнаты: изменилась — индекс устарел. Дешёвые агрегаты по каждому источнику. */
function signature(roomId: string): string {
  const q = (table: string, time: string, extra = '') =>
    sqlite.prepare(`select count(*) || ':' || coalesce(max(${time}), 0) as s from ${table} where room_id = ? ${extra}`).get(roomId) as { s: string };
  const notes = sqlite
    .prepare("select count(*) || ':' || coalesce(max(n.updated_at), 0) as s from session_note n join game_session g on g.id = n.session_id where g.room_id = ?")
    .get(roomId) as { s: string };
  return [
    q('diary_entry', 'updated_at', 'and private = 0').s,
    q('map_place', 'updated_at').s,
    q('map_spot', 'updated_at').s,
    q('map_rumor', 'updated_at').s,
    notes.s,
    q('letter', 'updated_at').s,
    q('chapter', 'updated_at').s,
    q('downtime', 'updated_at').s,
    q('npc', 'updated_at').s,
    q('character', 'updated_at').s,
    q('moment', 'created_at').s,
  ].join('|');
}

function collect(roomId: string): Doc[] {
  const out: Doc[] = [];
  const names = new Map(
    db
      .select({ id: schema.member.id, name: schema.member.name })
      .from(schema.member)
      .where(eq(schema.member.roomId, roomId))
      .all()
      .map((m) => [m.id, m.name]),
  );
  const chars = db.select().from(schema.character).where(eq(schema.character.roomId, roomId)).all();
  const charName = new Map(chars.map((c) => [c.id, c.name]));
  const places = db.select().from(schema.mapPlace).where(eq(schema.mapPlace.roomId, roomId)).all();
  const placeName = new Map(places.map((p) => [p.id, p.name]));

  for (const e of db.select().from(schema.diaryEntry).where(eq(schema.diaryEntry.roomId, roomId)).all()) {
    if (e.private) continue; // правило 7
    out.push({
      kind: 'diary',
      ref: e.id,
      link: '/gm/requests',
      title: `${(e.characterId && charName.get(e.characterId)) || names.get(e.memberId) || 'Игрок'}${e.request ? ' · вопрос' : ''}`,
      body: [e.text, e.reply].join('\n'),
    });
  }
  for (const p of places) {
    if (p.kind === 'deleted') continue;
    out.push({ kind: 'place', ref: p.id, link: '/gm/maps', title: p.name || 'Место', body: [p.subtitle, p.description, p.ruler, p.faction, p.population, p.noteGm].join('\n') });
  }
  for (const s of db.select().from(schema.mapSpot).where(eq(schema.mapSpot.roomId, roomId)).all())
    out.push({ kind: 'spot', ref: s.id, link: '/gm/maps', title: `${s.name || 'Место в городе'} · ${placeName.get(s.placeId) ?? ''}`, body: [s.description, s.noteGm].join('\n') });
  for (const r of db.select().from(schema.mapRumor).where(eq(schema.mapRumor.roomId, roomId)).all())
    out.push({
      kind: 'rumor',
      ref: r.id,
      link: '/gm/maps',
      title: `${r.proposed ? 'Сказ' : r.kind === 'quest' ? 'Задание' : 'Слух'} · ${placeName.get(r.placeId) ?? ''}`,
      body: [r.text, r.noteGm].join('\n'),
    });
  for (const n of db
    .select({ id: schema.sessionNote.sessionId, text: schema.sessionNote.text, at: schema.gameSession.startedAt })
    .from(schema.sessionNote)
    .innerJoin(schema.gameSession, eq(schema.gameSession.id, schema.sessionNote.sessionId))
    .where(eq(schema.gameSession.roomId, roomId))
    .all())
    if (n.text.trim()) out.push({ kind: 'note', ref: n.id, link: '/gm/notes', title: `Сессия ${new Date(n.at).toLocaleDateString('ru-RU')}`, body: n.text });
  for (const l of db.select().from(schema.letter).where(eq(schema.letter.roomId, roomId)).all())
    out.push({ kind: 'letter', ref: l.id, link: '/gm/letters', title: `${l.fromName} → ${charName.get(l.characterId) ?? ''}`, body: [l.text, l.reply, l.noteGm].join('\n') });
  for (const c of db.select().from(schema.chapter).where(eq(schema.chapter.roomId, roomId)).all())
    out.push({ kind: 'chapter', ref: c.id, link: '/gm/chronicle', title: c.title, body: c.text });
  for (const d of db.select().from(schema.downtime).where(eq(schema.downtime.roomId, roomId)).all())
    out.push({
      kind: 'downtime',
      ref: d.id,
      link: '/gm',
      title: `${charName.get(d.characterId) ?? ''} · ${DOWNTIME_KIND_LABELS[d.kind as DowntimeKind] ?? d.kind}`,
      body: [d.text, d.outcome ?? ''].join('\n'),
    });
  for (const n of db.select().from(schema.npc).where(eq(schema.npc.roomId, roomId)).all())
    out.push({ kind: 'npc', ref: n.id, link: '/gm/npcs', title: n.name || 'Противник', body: [n.notesGm, n.bestiaryText].join('\n') });
  const secrets = new Map(
    db
      .select()
      .from(schema.characterSecret)
      .all()
      .map((s) => [s.characterId, s.doc]),
  );
  for (const c of chars) {
    const raw = secrets.get(c.id);
    const notes = raw ? parseDoc(raw).notes : '';
    out.push({ kind: 'character', ref: c.id, link: `/gm/char/${c.id}`, title: c.name, body: [c.publicBio, notes].join('\n') });
  }
  for (const m of db.select().from(schema.moment).where(eq(schema.moment.roomId, roomId)).all())
    out.push({
      kind: 'moment',
      ref: m.id,
      link: `/gm/char/${m.characterId}`,
      title: `${charName.get(m.characterId) ?? ''} · ${MOMENT_KIND_LABELS[m.kind as MomentKind] ?? ''}`,
      body: [m.title, m.text, m.noteGm].join('\n'),
    });
  return out.filter((d) => (d.title + d.body).trim());
}

function ensureIndex(roomId: string): void {
  const sig = signature(roomId);
  if (built.get(roomId) === sig) return;
  const docs = collect(roomId);
  const del = sqlite.prepare('delete from search_doc where room_id = ?');
  const ins = sqlite.prepare('insert into search_doc (room_id, kind, ref, link, title, body) values (?, ?, ?, ?, ?, ?)');
  sqlite.transaction(() => {
    del.run(roomId);
    for (const d of docs) ins.run(roomId, d.kind, d.ref, d.link, d.title, d.body.slice(0, 50000));
  })();
  built.set(roomId, sig);
}

/** Слова → префиксный запрос FTS5 (AND). Спецсимволы выбрасываются; пусто — null. */
export function ftsQuery(q: string): string | null {
  const words = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 0)
    .slice(0, 8);
  return words.length ? words.map((w) => `"${w}"*`).join(' ') : null;
}

export function search(roomId: string, q: string): GmSearchHit[] {
  const fts = ftsQuery(q);
  if (!fts) return [];
  ensureIndex(roomId);
  return sqlite
    .prepare(
      `select kind, ref, link, title, snippet(search_doc, 5, '[[', ']]', '…', 14) as snippet
       from search_doc where search_doc match ? and room_id = ? order by bm25(search_doc, 0, 0, 0, 0, 3.0, 1.0) limit 50`,
    )
    .all(fts, roomId) as GmSearchHit[];
}
