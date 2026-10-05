import { useEffect, useState } from 'react';
import { SUMMARY_TITLES, type GmCharacterView, type GmSummary, type SummaryCheck, type SummaryOptions } from '@zg/shared';
import { api } from '../lib/api.ts';
import { Badge, Button, Card, CardTitle, Select, Spinner, Textarea, toast } from '../ui/index.ts';

let optionsCache: SummaryOptions | null = null;

/** ИИ-сводки персонажа. Новый текст всегда неопубликован; публикация игроку — после проверки Jev. */
export function SummaryPanel({ c, onChange }: { c: GmCharacterView; onChange: (c: GmCharacterView) => void }) {
  const [opts, setOpts] = useState<SummaryOptions | null>(optionsCache);
  useEffect(() => {
    if (optionsCache) return;
    void api<SummaryOptions>('GET', '/api/gm/summary-options').then((r) => {
      if (r.ok) {
        optionsCache = r.data;
        setOpts(r.data);
      }
    });
  }, []);
  if (!opts || c.kind !== 'popadanets') return null;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle className="grow">Сводки</CardTitle>
        <Badge tone={c.summaries.some((s) => s.show) ? 'ok' : 'neutral'}>
          {c.summaries.filter((s) => s.text).length} из 3 · {c.summaries.some((s) => s.show) ? 'игрок видит' : 'игроку не опубликовано'}
        </Badge>
      </div>
      {!opts.configured && <p className="small error m-0">Ключ Claude API не задан: написать сводку не получится, править и публиковать — можно.</p>}
      {c.summaries.map((s) => (
        <SummaryItem key={s.kind} c={c} s={s} opts={opts} onChange={onChange} />
      ))}
    </Card>
  );
}

function SummaryItem({ c, s, opts, onChange }: { c: GmCharacterView; s: GmSummary; opts: SummaryOptions; onChange: (c: GmCharacterView) => void }) {
  const [tone, setTone] = useState(s.tone || opts.tones[0] || '');
  const [person, setPerson] = useState(s.person || '2');
  const [text, setText] = useState(s.text);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<SummaryCheck | null>(null);
  useEffect(() => setText(s.text), [s.text]);
  const base = `/api/gm/characters/${encodeURIComponent(c.id)}/summary/${s.kind}`;
  const forPlayer = s.kind !== 'gm';

  const generate = async (quick: boolean) => {
    setBusy(quick ? 'Пишу черновик…' : 'Пишу…');
    setError(null);
    setCheck(null);
    const r = await api<GmCharacterView>('POST', `${base}/generate`, { tone, person, quick });
    setBusy(null);
    if (r.ok) onChange(r.data);
    else setError(r.message ?? 'Не получилось');
  };
  const save = async (body: { text?: string; show?: boolean }) => {
    const r = await api<GmCharacterView>('POST', base, body);
    if (r.ok) onChange(r.data);
    else setError('Не сохранилось');
    return r.ok;
  };
  const runCheck = async () => {
    setBusy('Проверяю…');
    const r = await api<SummaryCheck>('POST', `${base}/check`);
    setBusy(null);
    const res: SummaryCheck = r.ok ? r.data : { facts: { status: 'unavailable', flagged: [] }, leak: { status: 'unavailable', others: [] } };
    return res;
  };
  const publish = async (force: boolean) => {
    setError(null);
    if (text !== s.text && !(await save({ text }))) return;
    if (!force) {
      const res = await runCheck();
      const bad = (x: { status: string }) => x.status === 'warn' || x.status === 'unavailable';
      if (bad(res.facts) || bad(res.leak)) return setCheck(res);
    }
    setCheck(null);
    if (await save({ show: true })) toast('Сводка опубликована игроку');
  };

  return (
    <div className="grid gap-2 border-t border-solid border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 grow">{SUMMARY_TITLES[s.kind]}</h3>
        {forPlayer && s.text && <Badge tone={s.show ? 'ok' : 'neutral'}>{s.show ? 'игрок видит' : 'не опубликовано'}</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select aria-label="Тон" value={tone} onValueChange={setTone} options={opts.tones.map((t) => ({ value: t, label: t }))} className="w-auto min-w-[160px]" />
        {forPlayer && (
          <Select
            aria-label="Лицо"
            value={person}
            onValueChange={setPerson}
            options={opts.persons.map((p) => ({ value: p.key, label: p.label }))}
            className="w-auto min-w-[160px]"
          />
        )}
        <Button disabled={!!busy || !opts.configured} onClick={() => generate(false)}>
          {s.text ? 'Переписать' : 'Написать'}
        </Button>
        <Button variant="ghost" disabled={!!busy || !opts.configured} onClick={() => generate(true)}>
          Быстрый черновик
        </Button>
      </div>
      {busy && (
        <p className="m-0 flex items-center gap-2 text-[13.6px] text-muted" role="status">
          <Spinner /> {busy}
        </p>
      )}
      {error && <p className="small error m-0">{error}</p>}
      {(s.text || text) && (
        <>
          <Textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={20000}
            aria-label={SUMMARY_TITLES[s.kind]}
            className="font-read text-base leading-relaxed"
          />
          <p className="m-0 text-[13px] text-muted">
            {s.model && `${s.model}`}
            {s.edited && ' · правлено вручную'}
          </p>
          <div className="flex flex-wrap gap-2">
            {text !== s.text && (
              <Button disabled={!!busy} onClick={async () => (await save({ text })) && toast('Правка сохранена')}>
                Сохранить правку
              </Button>
            )}
            {forPlayer && !s.show && (
              <Button variant="primary" disabled={!!busy || !text.trim()} onClick={() => publish(false)}>
                Опубликовать игроку
              </Button>
            )}
            {forPlayer && s.show && (
              <Button variant="ghost" disabled={!!busy} onClick={async () => (await save({ show: false })) && toast('Сводка снята с публикации')}>
                Снять с публикации
              </Button>
            )}
            {!forPlayer && (
              <Button variant="ghost" disabled={!!busy || text !== s.text} onClick={async () => setCheck(await runCheck())}>
                Проверить выдумки
              </Button>
            )}
          </div>
        </>
      )}
      {check && (
        <div className="jev-warn">
          {check.facts.status === 'unavailable' && <p>Проверка недоступна (Jev не ответил).</p>}
          {check.facts.status === 'ok' && check.leak.status !== 'warn' && <p>Jev ничего подозрительного не нашёл.</p>}
          {check.facts.flagged.map((f) => (
            <p key={f.sentence}>
              Похоже на выдумку ({Math.round(f.probability * 100)}%): «{f.sentence}»
            </p>
          ))}
          {check.leak.others.map((o) => (
            <p key={o.traitName}>
              Похоже, выдаёт скрытую черту «{o.traitName}» ({Math.round(o.probability * 100)}%).
            </p>
          ))}
          <div className="flex gap-2">
            {forPlayer && !s.show && <Button onClick={() => publish(true)}>Опубликовать всё равно</Button>}
            <Button variant="ghost" onClick={() => setCheck(null)}>
              {forPlayer ? 'Поправить' : 'Закрыть'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
