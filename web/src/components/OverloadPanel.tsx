import { useCallback, useEffect, useState } from 'react';
import { SIGN_TEXT, type GmOverload } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';

/** Перегрузка зелёной магией: видит только мастер. Столу по кнопке уходит лишь видимый признак. */
export function OverloadPanel() {
  const [list, setList] = useState<GmOverload[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<GmOverload[]>('GET', '/api/gm/overload');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('gm:overload.changed', ({ overload }) =>
    setList((l) => (l.some((x) => x.characterId === overload.characterId) ? l.map((x) => (x.characterId === overload.characterId ? overload : x)) : [...l, overload])),
  );
  useSocketEvent('gm:character.changed', () => void load());

  const change = async (id: string, body: Record<string, unknown>) => {
    const r = await api<GmOverload>('POST', `/api/gm/overload/${encodeURIComponent(id)}`, body);
    if (r.ok) setList((l) => l.map((x) => (x.characterId === id ? r.data : x)));
  };
  const show = async (o: GmOverload) => {
    const r = await api('POST', `/api/gm/overload/${encodeURIComponent(o.characterId)}/show`);
    if (r.ok) {
      setShown(o.characterId);
      window.setTimeout(() => setShown((s) => (s === o.characterId ? null : s)), 2500);
    }
  };

  return (
    <section className="card">
      <h2>Перегрузка зелёной магией</h2>
      {list.length === 0 && <p className="muted">Персонажей нет.</p>}
      <ul className="list">
        {list.map((o) => (
          <li key={o.characterId} className="overload-row">
            <div className="overload-head">
              <strong>{o.name}</strong>
              <span className={`sign sign-${o.sign}`}>{SIGN_TEXT[o.sign]}</span>
            </div>
            <div className="overload-ctl">
              <button type="button" className="btn btn-ghost" onClick={() => change(o.characterId, { delta: -1 })} disabled={o.value <= 0} aria-label="Минус один">
                −1
              </button>
              <span className="overload-value">{o.value}</span>
              <button type="button" className="btn btn-secondary" onClick={() => change(o.characterId, { delta: 1 })} aria-label="Плюс один">
                +1
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => change(o.characterId, { reset: true })} disabled={o.value === 0}>
                Сброс
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => show(o)}>
                {shown === o.characterId ? 'Показано' : 'Показать столу'}
              </button>
            </div>
            <div className="row small muted">
              <label className="inline-num">
                глаза с
                <input
                  type="number"
                  min={1}
                  max={98}
                  value={o.eyesAt}
                  onChange={(e) => change(o.characterId, { eyesAt: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
              <label className="inline-num">
                кожа с
                <input
                  type="number"
                  min={2}
                  max={99}
                  value={o.skinAt}
                  onChange={(e) => change(o.characterId, { skinAt: Math.max(2, Number(e.target.value) || 2) })}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
