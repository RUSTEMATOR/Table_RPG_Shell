import { useEffect, useRef, useState } from 'react';
import { EFFECT_LABELS } from '@zg/shared';
import { addOwn, type FeedRoll } from '../lib/feed.ts';
import { requestRoll } from '../lib/socket.ts';

const MIN_ANIM_MS = 700;

function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Панель броска. Результат всегда приходит с сервера; анимация не дольше 1,2 с. */
export function RollPanel({ role }: { role: 'gm' | 'player' }) {
  const options =
    role === 'gm'
      ? ([
          ['public', 'Всем'],
          ['gm_hidden', 'Скрытый'],
        ] as const)
      : ([
          ['public', 'Всем'],
          ['gm_and_me', 'Мне и мастеру'],
        ] as const);
  const [visibility, setVisibility] = useState<string>('public');
  const [label, setLabel] = useState('');
  const [pending, setPending] = useState<{ id: string; kind: 'd10' | 'd20' } | null>(null);
  const [spin, setSpin] = useState<number | null>(null);
  const [result, setResult] = useState<FeedRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
    },
    [],
  );

  const send = async (kind: 'd10' | 'd20', id: string) => {
    setPending({ id, kind });
    setError(null);
    setResult(null);
    const sides = kind === 'd10' ? 10 : 20;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = window.setInterval(() => setSpin(1 + Math.floor(Math.random() * sides)), 70);
    }
    const started = Date.now();
    const res = await requestRoll({ clientRequestId: id, kind, visibility, label: label.trim() });
    const wait = reduce ? 0 : Math.max(0, MIN_ANIM_MS - (Date.now() - started));
    window.setTimeout(() => {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      setSpin(null);
      if (res.ok) {
        addOwn(res.roll);
        setResult(res.roll);
        setPending(null);
        setLabel('');
      } else {
        // pending остаётся: «Повторить» отправит тот же запрос, сервер не бросит дважды.
        setError(res.error === 'timeout' ? 'Нет ответа от сервера.' : `Не получилось: ${res.error}`);
      }
    }, wait);
  };

  const busy = pending !== null && error === null;

  return (
    <section className="card roll-panel">
      <div className="row">
        {options.map(([k, l]) => (
          <button key={k} type="button" className={`tab ${visibility === k ? 'tab-on' : ''}`} onClick={() => setVisibility(k)} disabled={busy}>
            {l}
          </button>
        ))}
      </div>
      <input
        className="roll-label"
        placeholder={role === 'gm' ? 'Кто или что бросает (необязательно)' : 'Что делаю (необязательно)'}
        value={label}
        maxLength={300}
        onChange={(e) => setLabel(e.target.value)}
        disabled={busy}
      />
      <div className="dice">
        <button type="button" className="btn die" disabled={busy} onClick={() => send('d10', newRequestId())}>
          d10
        </button>
        <button type="button" className="btn btn-secondary die" disabled={busy} onClick={() => send('d20', newRequestId())}>
          d20
        </button>
      </div>
      <div className="roll-result" aria-live="polite">
        {spin !== null && <span className="roll-spin">{spin}</span>}
        {spin === null && result && (
          <>
            <span className="roll-value">{result.value}</span>
            <span className={`roll-effect effect-${result.effect}`}>{EFFECT_LABELS[result.effect]}</span>
          </>
        )}
      </div>
      {error && pending && (
        <div className="row">
          <p className="error">{error}</p>
          <button type="button" className="btn btn-secondary" onClick={() => send(pending.kind, pending.id)}>
            Повторить
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => (setPending(null), setError(null))}>
            Отмена
          </button>
        </div>
      )}
    </section>
  );
}
