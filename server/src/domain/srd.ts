import { SrdBestiarySchema, type SrdListItem, type SrdMonster } from '@zg/shared';
import { powerBand } from './cards.ts';
import { SUMMARY_LORE, load } from './data.ts';
import type { NpcRow } from './npc.ts';

// Справочник D&D SRD (этап 50, шаг 5): seed/bestiary-srd.json из tools/extract-bestiary. Только мастеру.

const SRD = load('bestiary-srd', SrdBestiarySchema);
export const SRD_ATTRIBUTION = SRD.attribution;
const bySlug = new Map(SRD.monsters.map((m) => [m.slug, m]));

/** CR → уровень силы «Зеленогорья» (ступени: обычный до 50, героический до 100, монструозный до 300, легендарный до 600, выше — полубоги). */
export function powerFromCr(cr: number): number {
  if (cr <= 0) return 5;
  if (cr < 1) return Math.round(6 + cr * 16); // 1/8 → 8, 1/4 → 10, 1/2 → 14
  if (cr <= 10) return Math.round(12 + cr * 8.3); // 1 → 20 … 10 → 95
  if (cr <= 16) return Math.round(95 + (cr - 10) * 17); // 11 → 112 … 16 → 197
  if (cr <= 20) return Math.round(200 + (cr - 16) * 25); // 17 → 225 … 20 → 300
  if (cr <= 24) return Math.round(300 + (cr - 20) * 45); // 21 → 345 … 24 → 480
  return Math.min(1000, Math.round(480 + (cr - 24) * 87)); // 25 → 567 … 30 → 1000
}

export function srdList(): SrdListItem[] {
  return SRD.monsters.map((m) => {
    const power = powerFromCr(m.crNum);
    return { slug: m.slug, name: m.name, size: m.size, type: m.type, cr: m.cr, power, band: powerBand(power).label };
  });
}

export const srdGet = (slug: string): SrdMonster | undefined => bySlug.get(slug);

/** Статблок в заметки мастера (по-английски, как в SRD; мастер читает сам). */
export function statblock(m: SrdMonster): string {
  const [str, dex, con, int, wis, cha] = m.stats;
  const lines = [
    `D&D SRD 5.1: ${m.name} — ${m.size} ${m.type}${m.subtype ? ` (${m.subtype})` : ''}, ${m.alignment}. CR ${m.cr}.`,
    `AC ${m.ac}, HP ${m.hp}, speed ${m.speed || '—'}.`,
    `STR ${str} DEX ${dex} CON ${con} INT ${int} WIS ${wis} CHA ${cha}.`,
    m.senses ? `Senses: ${m.senses}.` : '',
    m.languages ? `Languages: ${m.languages}.` : '',
    ...m.abilities.map((a) => `• ${a.name}. ${a.desc}`),
    m.actions.length ? 'Actions:' : '',
    ...m.actions.map((a) => `• ${a.name}. ${a.desc}`),
    m.legendary ? 'Has legendary actions.' : '',
    `(${SRD.license.split(' — ')[0]}, SRD 5.1 by Wizards of the Coast)`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Подсказка Claude: русское описание чудища для игроков по статблоку и подсказке мастера. */
export function beastPrompt(n: NpcRow, hint: string): string {
  const srd = [...bySlug.values()].find((m) => m.name === n.name);
  return [
    'Ты помогаешь мастеру настольной ролевой игры «Зеленогорье» описать чудище для бестиария игроков.',
    `Канон мира: ${SUMMARY_LORE}`,
    `Чудище: ${n.name}.`,
    srd ? `Справка (D&D SRD, по-английски): ${statblock(srd).slice(0, 2500)}` : n.notesGm.trim() ? `Заметки мастера: ${n.notesGm.trim().slice(0, 2000)}` : '',
    hint ? `Подсказка мастера: ${hint}` : '',
    '',
    'Напиши по-русски 3–5 предложений для игроков: как выглядит, где водится, чем опасно, что о нём говорят в народе. В духе средневекового фэнтези этого мира, без игровой механики, чисел, названий правил и слов «D&D». Только текст.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}
