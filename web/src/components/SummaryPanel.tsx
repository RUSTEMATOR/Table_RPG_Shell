import { useEffect, useState } from 'react';
import { SUMMARY_TITLES, type GmCharacterView, type GmSummary, type SummaryCheck, type SummaryOptions } from '@zg/shared';
import { api } from '../lib/api.ts';

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
    <section className="card">
      <h2>Сводки</h2>
      {!opts.configured && <p className="small error">Ключ Claude API не задан: написать сводку не получится, править и публиковать — можно.</p>}
      {c.summaries.map((s) => (
        <SummaryItem key={s.kind} c={c} s={s} opts={opts} onChange={onChange} />
      ))}
    </section>
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
    const res: SummaryCheck = r.ok
      ? r.data
      : { facts: { status: 'unavailable', flagged: [] }, leak: { status: 'unavailable', others: [] } };
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
    await save({ show: true });
  };

  return (
    <div className="summary">
      <div className="row spread">
        <h3>{SUMMARY_TITLES[s.kind]}</h3>
        {forPlayer && s.text && <span className={`small ${s.show ? 'jev-note' : 'muted'}`}>{s.show ? 'игрок видит' : 'не опубликовано'}</span>}
      </div>
      <div className="row">
        <select value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Тон">
          {opts.tones.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {forPlayer && (
          <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Лицо">
            {opts.persons.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="row">
        <button type="button" className="btn btn-secondary" disabled={!!busy || !opts.configured} onClick={() => generate(false)}>
          {s.text ? 'Переписать' : 'Написать'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={!!busy || !opts.configured} onClick={() => generate(true)}>
          Быстрый черновик
        </button>
      </div>
      {busy && <p className="small muted">{busy}</p>}
      {error && <p className="small error">{error}</p>}
      {(s.text || text) && (
        <>
          <textarea className="summary-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} />
          <p className="small muted">
            {s.model && `${s.model}`}
            {s.edited && ' · правлено вручную'}
          </p>
          <div className="row">
            {text !== s.text && (
              <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => save({ text })}>
                Сохранить правку
              </button>
            )}
            {forPlayer && !s.show && (
              <button type="button" className="btn" disabled={!!busy || !text.trim()} onClick={() => publish(false)}>
                Опубликовать игроку
              </button>
            )}
            {forPlayer && s.show && (
              <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => save({ show: false })}>
                Снять с публикации
              </button>
            )}
            {!forPlayer && (
              <button type="button" className="btn btn-ghost" disabled={!!busy || text !== s.text} onClick={async () => setCheck(await runCheck())}>
                Проверить выдумки
              </button>
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
          <div className="row">
            {forPlayer && !s.show && (
              <button type="button" className="btn btn-secondary" onClick={() => publish(true)}>
                Опубликовать всё равно
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setCheck(null)}>
              {forPlayer ? 'Поправить' : 'Закрыть'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
