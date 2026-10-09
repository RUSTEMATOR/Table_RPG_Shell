import { MOMENT_KIND_LABELS, type DiaryEntryPlayer, type LetterPlayer, type PlayerCharacter } from '@zg/shared';
import { api } from './api.ts';

// Экспорт игрока (этап 56): карточка, дневник (свои записи, в том числе «только для меня») и письма — в Markdown или
// в окно печати («Сохранить как PDF»). Всё собирается на устройстве из того, что игрок и так получает; сервер не участвует.

export interface ExportData {
  character: PlayerCharacter | null;
  diary: DiaryEntryPlayer[];
  letters: LetterPlayer[];
}

export async function loadExportData(): Promise<ExportData> {
  const [c, d, l] = await Promise.all([
    api<{ character: PlayerCharacter | null }>('GET', '/api/player/character'),
    api<{ entries: DiaryEntryPlayer[] }>('GET', '/api/player/diary'),
    api<{ letters: LetterPlayer[] }>('GET', '/api/player/letters'),
  ]);
  return { character: c.ok ? c.data.character : null, diary: d.ok ? d.data.entries : [], letters: l.ok ? l.data.letters : [] };
}

const day = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const kindOf = (e: DiaryEntryPlayer) => (e.request ? 'Вопрос мастеру' : e.private ? 'Только мне' : 'Дневник');

export function toMarkdown(x: ExportData): string {
  const out: string[] = [];
  const c = x.character;
  out.push(`# ${c?.name || 'Без персонажа'}`, '');
  if (c) {
    const sub = [c.origin, c.pronoun !== 'не указано' ? c.pronoun : '', c.powerBand ? `уровень силы: ${c.powerBand}` : ''].filter(Boolean).join(' · ');
    if (sub) out.push(`_${sub}_`, '');
    if (c.bio) out.push(c.bio, '');
    if (c.summary) out.push('## Вступление', '', c.summary, '');
    if (c.profession)
      out.push('## Ремесло', '', `${c.profession.label}${c.profession.local ? ` (${c.profession.local})` : ''}${c.profession.edge ? ` — ${c.profession.edge}` : ''}`, '');
    if (c.traits.length) {
      out.push('## Черты', '');
      for (const t of c.traits) {
        out.push(`### ${t.name} · ${t.cat}`, '', t.d);
        for (const s of t.stagesShown) out.push(`- ${s}`);
        if (t.price) out.push(`- Цена: ${t.price}`);
        out.push('');
      }
    }
    if (c.hints.length) out.push('## Что-то происходит', '', ...c.hints.map((h) => `- ${h}`), '');
    const notes = (title: string, list: { title: string; text: string }[]) => {
      if (!list.length) return;
      out.push(`## ${title}`, '');
      for (const n of list) out.push(`- **${n.title}**${n.text ? ` — ${n.text}` : ''}`);
      out.push('');
    };
    notes('Снаряжение', c.items);
    notes('Состояния', c.conditions);
    notes('Связи', c.relations);
    if (c.moments.length)
      out.push('## Памятные моменты', '', ...c.moments.map((m) => `- **${m.title}** (${MOMENT_KIND_LABELS[m.kind]}, ${day(m.at)})${m.text ? ` — ${m.text}` : ''}`), '');
    if (c.sparks) out.push(`Искры: ${c.sparks}`, '');
  }
  if (x.letters.length) {
    out.push('## Письма', '');
    for (const l of [...x.letters].sort((a, b) => a.deliveredAt - b.deliveredAt)) {
      out.push(`### От ${l.from} · ${day(l.deliveredAt)}`, '', l.text, '');
      if (l.reply) out.push(`> Мой ответ: ${l.reply.replace(/\n/g, '\n> ')}`, '');
    }
  }
  if (x.diary.length) {
    out.push('## Дневник', '');
    for (const e of [...x.diary].sort((a, b) => a.createdAt - b.createdAt)) {
      out.push(`### ${kindOf(e)} · ${day(e.createdAt)}`, '', e.text, '');
      if (e.reply) out.push(`> Мастер: ${e.reply.replace(/\n/g, '\n> ')}`, '');
    }
  }
  out.push('---', `Выгружено из «Зеленогорья» ${day(Date.now())}.`);
  return out.join('\n');
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Markdown → простой HTML для печати (заголовки, списки, цитаты, жирный, курсив). */
function mdToHtml(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let list = false;
  const inline = (t: string) =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1<i>$2</i>');
  for (const l of lines) {
    if (l.startsWith('- ')) {
      if (!list) html.push('<ul>');
      list = true;
      html.push(`<li>${inline(l.slice(2))}</li>`);
      continue;
    }
    if (list) {
      html.push('</ul>');
      list = false;
    }
    if (l.startsWith('### ')) html.push(`<h3>${inline(l.slice(4))}</h3>`);
    else if (l.startsWith('## ')) html.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (l.startsWith('# ')) html.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (l.startsWith('> ')) html.push(`<blockquote>${inline(l.slice(2))}</blockquote>`);
    else if (l === '---') html.push('<hr>');
    else if (l.trim()) html.push(`<p>${inline(l)}</p>`);
  }
  if (list) html.push('</ul>');
  return html.join('\n');
}

export function downloadMarkdown(x: ExportData): void {
  const blob = new Blob([toMarkdown(x)], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(x.character?.name || 'zelenogorye').replace(/[\\/:*?"<>|]+/g, '_')}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Окно печати открывается сразу по нажатию (иначе его заблокирует браузер), содержимое пишется, когда данные готовы. */
export function openPrintWindow(): Window | null {
  const w = window.open('', '_blank');
  if (w) w.document.write('<!doctype html><meta charset="utf-8"><title>Зеленогорье</title><p style="font:15px Georgia,serif;margin:32px">Готовлю…</p>');
  return w;
}

/** Содержимое в окно печати: браузер предложит «Сохранить как PDF». */
export function printExport(w: Window, x: ExportData): void {
  w.document.open();
  const title = esc(x.character?.name || 'Зеленогорье');
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title><style>
    body{font:15px/1.55 Lora,Georgia,serif;color:#1d1d1b;max-width:720px;margin:32px auto;padding:0 20px}
    h1{font-size:28px;margin:0 0 6px}h2{font-size:20px;margin:28px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}
    h3{font-size:16px;margin:18px 0 4px}blockquote{margin:6px 0;padding:6px 12px;border-left:3px solid #6b8f5e;background:#f3f6f1}
    ul{padding-left:20px}hr{margin:28px 0;border:0;border-top:1px solid #ccc}
    @media print{body{margin:0}h2,h3{break-after:avoid}blockquote,li{break-inside:avoid}}
  </style></head><body>${mdToHtml(toMarkdown(x))}<script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);
  w.document.close();
}
