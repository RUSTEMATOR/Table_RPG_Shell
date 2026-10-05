import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARCHS, SOURCES, SUMMARY_LORE, TIERS, UNIVERSES } from './data.ts';
import { cardOf, catLabel, combosFor, effSteps, gmLayers, nextTrigger, powerBand, powerOf, stepText } from './cards.ts';
import { STAGE_NAMES, int04, pronounWord, type CharDoc } from './character.ts';
import { affinityNote, craftOf } from './randomizer.ts';
import type { LoadedCharacter } from './repo.ts';
import { projectForPlayer } from '../visibility/character.ts';
import { SERVER_ROOT } from '../paths.ts';

// Данные и промпты сводок — перенос «SUMMARY» из рандомизатора. Промпты дословно из seed/summary-*.json.
// gm — всё, что знает мастер; player — только projectForPlayer; crossing — происхождение и признаки скрытых черт.

const seed = (f: string) => JSON.parse(readFileSync(join(SERVER_ROOT, '..', 'seed', `${f}.json`), 'utf8')) as unknown;
const PROMPTS = seed('summary-prompts') as Record<'gm' | 'player' | 'crossing', string>;
const EXAMPLES = seed('summary-examples') as Record<'gm' | 'player', string>;
export const SUM_TONES = seed('summary-tones') as string[];
const SUM_PERSONS = seed('summary-persons') as [string, string, string][];
const DEMAND_WORDS = ['', 'почти не нужна', 'пригодится', 'нарасхват'];
const SUMMARY_CAP = 12000;

export type SummaryKind = 'gm' | 'player' | 'crossing';
export const hasPerson = (k: SummaryKind) => k === 'player' || k === 'crossing';

type Data = Record<string, unknown>;

function dataGm(x: CharDoc): Data {
  const src = SOURCES.find((s) => s[0] === x.source)?.[1] ?? String(x.source ?? '');
  const uv = UNIVERSES[x.universe];
  const arch = ARCHS.find((a) => a[0] === x.arch)?.[1] ?? String(x.arch ?? '');
  const cr = craftOf(x);
  const d: Data = {
    имя: String(x.name || 'Без имени'),
    источник: src,
    вселенная: uv ? uv.name : '',
    архетип: arch,
    pronoun: pronounWord(x.pronoun),
    power: { value: powerOf(x), band: powerBand(powerOf(x)).label },
  };
  if (cr)
    d['профессия'] = {
      название: cr.label,
      'местный аналог': cr.local,
      спрос: cr.demand ? DEMAND_WORDS[cr.demand] : '',
      преимущество: cr.edge,
      крючок: cr.hook,
    };
  d['черты'] = x.slots.map((sl) => {
    const card = cardOf(sl);
    const st = int04(sl.stage);
    const steps = effSteps(card, sl);
    const gl = gmLayers(sl, x);
    const o: Data = {};
    o['категория'] = catLabel(sl);
    o['название'] = card.name;
    o['тир'] = sl.tier === 'fixed' ? 'всегда' : (TIERS[sl.tier as keyof typeof TIERS] ?? String(sl.tier ?? ''));
    o['суть'] = card.d;
    o['ступень'] = `${st} из 4: ${STAGE_NAMES[st]!.toLowerCase()}`;
    if (st >= 1) o['текущая ступень'] = stepText(steps[st - 1]!);
    if (st < 4) {
      o['следующая ступень'] = stepText(steps[st]!);
      const nt = nextTrigger(sl);
      if (nt) o['триггер следующей ступени'] = nt.text;
    }
    if (gl?.truth) o['правда для мастера'] = gl.truth;
    if (gl?.hooks.length) o['крючки'] = gl.hooks.slice();
    if (card.price) o['цена'] = card.price;
    if (card.fork) o['развилка'] = { А: `${card.fork.a.title}: ${card.fork.a.text}`, Б: `${card.fork.b.title}: ${card.fork.b.text}` };
    if (sl.fork && card.fork?.[sl.fork]) o['выбранная развилка'] = card.fork[sl.fork].title;
    const an = affinityNote(sl, x);
    if (an) o['примечание'] = an;
    if (sl.matched) o['совпадает с родным архетипом'] = true;
    return o;
  });
  d['сочетания'] = combosFor(x).map(
    (c) => `${c.names[0]} + ${c.names[1]}${c.text ? `: ${c.text.replace(/^«[^»]+» и «[^»]+»:\s*/, '')}` : ''}`,
  );
  d['заметки мастера'] = String(x.notes || '').trim();
  return d;
}

function dataCrossing(x: CharDoc): Data {
  const src = SOURCES.find((s) => s[0] === x.source)?.[1] ?? String(x.source ?? '');
  const uv = UNIVERSES[x.universe];
  const arch = ARCHS.find((a) => a[0] === x.arch)?.[1] ?? '';
  const d: Data = { имя: String(x.name || 'Без имени'), pronoun: pronounWord(x.pronoun), откуда: [src, uv ? uv.name : ''].filter(Boolean).join(' · ') };
  if (arch && x.arch !== 'none') d['кем был дома'] = arch;
  const cr = craftOf(x);
  if (cr) d['профессия'] = cr.label + (cr.local ? ` (здесь это: ${cr.local})` : '');
  d['намёки'] = x.slots.map((sl) => gmLayers(sl, x)?.signs ?? '').filter(Boolean);
  return d;
}

/** Только то, что видит игрок: projectForPlayer в форме toPublic, без самой сводки и без отдельных подсказок. */
function dataPlayer(lc: LoadedCharacter): Data {
  const p = projectForPlayer(lc);
  const d: Data = { name: p.name, origin: p.origin, pronoun: p.pronoun, slots: p.traits };
  if (p.bio) d.bio = p.bio;
  if (p.powerBand) d.powerBand = p.powerBand;
  if (p.profession) d.profession = p.profession;
  if (p.crossing) d.crossing = p.crossing;
  return d;
}

const json = (d: unknown) => JSON.stringify(d, null, 1);

/** Урезка до SUMMARY_CAP: сначала заметки, потом крючки (по одному), потом правда. */
function cap(d: Data): Data {
  if (json(d).length <= SUMMARY_CAP) return d;
  const c = JSON.parse(json(d)) as Data;
  const notes = c['заметки мастера'];
  if (typeof notes === 'string') {
    const over = json(c).length - SUMMARY_CAP;
    c['заметки мастера'] = over >= notes.length ? '' : `${notes.slice(0, notes.length - over - 1)}…`;
  }
  const traits = (c['черты'] ?? []) as Data[];
  for (const o of traits) {
    if (json(c).length <= SUMMARY_CAP) break;
    if (Array.isArray(o['крючки'])) o['крючки'] = (o['крючки'] as string[]).slice(0, 1);
  }
  for (const o of traits) {
    if (json(c).length <= SUMMARY_CAP) break;
    if (typeof o['правда для мастера'] === 'string') o['правда для мастера'] = `${(o['правда для мастера'] as string).slice(0, 160)}…`;
  }
  return c;
}

export function summaryData(kind: SummaryKind, lc: LoadedCharacter): Data {
  if (kind === 'player') return dataPlayer(lc);
  if (kind === 'crossing') return dataCrossing(lc.doc);
  return cap(dataGm(lc.doc));
}

export function buildPrompt(kind: SummaryKind, data: Data, opts: { tone: string; person: string; pronoun: string }): string {
  const pe = (SUM_PERSONS.find((p) => p[0] === opts.person) ?? SUM_PERSONS[0]!)[2];
  const v: Record<string, string> = {
    LORE: SUMMARY_LORE,
    DATA: json(data),
    PRONOUN: opts.pronoun,
    TONE: opts.tone,
    PERSON: pe,
    EXAMPLE_GM: EXAMPLES.gm,
    EXAMPLE_PLAYER: EXAMPLES.player,
  };
  // Один проход: фигурные скобки внутри данных повторно не подставляются.
  return PROMPTS[kind].replace(/\{(LORE|DATA|PRONOUN|TONE|PERSON|EXAMPLE_GM|EXAMPLE_PLAYER)\}/g, (_m, k: string) => v[k] ?? '');
}

export const SUMMARY_PERSONS = SUM_PERSONS.map(([key, label]) => ({ key, label }));
