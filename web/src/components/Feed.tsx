import { useState } from 'react';
import { EFFECTS, EFFECT_LABELS, type Effect } from '@zg/shared';
import { isGmRoll, useFeed, type FeedRoll } from '../lib/feed.ts';
import { emitGm } from '../lib/socket.ts';
import { api } from '../lib/api.ts';
import { dismissGreen, useGreenSuggestions } from '../lib/suggestions.ts';

const time = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

function Override({ r }: { r: FeedRoll }) {
  const [open, setOpen] = useState(false);
  const [effect, setEffect] = useState<Effect>(r.effect);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" className="linkish" onClick={() => setOpen(true)}>
        Исправить
      </button>
    );
  return (
    <div className="override">
      <select value={effect} onChange={(e) => setEffect(e.target.value as Effect)}>
        {EFFECTS.map((k) => (
          <option key={k} value={k}>
            {EFFECT_LABELS[k]}
          </option>
        ))}
      </select>
      <input placeholder="Почему (видит только мастер)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      <div className="row">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            const res = await emitGm('gm:roll.override', { rollId: r.id, effect, note });
            if (res.ok) setOpen(false);
            else setErr(res.error ?? 'ошибка');
          }}
        >
          Сохранить
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

function GreenHint({ rollId }: { rollId: string }) {
  const green = useGreenSuggestions().get(rollId);
  if (!green) return null;
  return (
    <div className="jev-note row">
      <span>Похоже на зелёную магию ({Math.round(green.probability * 100)}%).</span>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          const r = await api('POST', `/api/gm/overload/${encodeURIComponent(green.characterId)}`, { delta: 1 });
          if (r.ok) dismissGreen(rollId);
        }}
      >
        +1 перегрузки
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => dismissGreen(rollId)}>
        Нет
      </button>
    </div>
  );
}

export function Feed({ limit = 50, gm = false }: { limit?: number; gm?: boolean }) {
  const feed = useFeed().slice(0, limit);
  if (!feed.length) return <p className="muted">Бросков пока нет.</p>;
  return (
    <ul className="feed">
      {feed.map((r) => {
        const g = isGmRoll(r) ? r : null;
        const hidden = g?.visibility === 'gm_hidden';
        const priv = isGmRoll(r) ? r.visibility === 'gm_and_me' : r.private;
        return (
          <li key={r.id} className={`feed-row ${hidden ? 'feed-hidden' : ''}`}>
            <div className="feed-main">
              <span className="feed-value">{r.value}</span>
              <div className="feed-text">
                <div>
                  <b>{r.character ?? r.who}</b>
                  {r.character && <span className="muted"> ({r.who})</span>} · {r.kind}
                  {r.label && <span> · {r.label}</span>}
                </div>
                <div className={`effect-${r.effect}`}>
                  {EFFECT_LABELS[r.effect]}
                  {r.corrected && <span className="muted small"> · исправлено мастером</span>}
                </div>
              </div>
              <span className="feed-meta">
                {hidden ? 'скрыто' : priv ? 'мастеру' : ''} {time(r.at)}
              </span>
            </div>
            {gm && g && (
              <div className="feed-gm small muted">
                {g.ruleText}
                {g.ruleText.startsWith('Бросок мастера') ? '' : ` Сила ${g.myPower} (${g.myBand})`}
                {g.enemyPower ? ` против ${g.enemyName ? `«${g.enemyName}» ` : ''}${g.enemyPower} (${g.enemyBand})` : ''}
                {g.ruleText.startsWith('Бросок мастера') ? '' : '.'}
                {g.outcome !== g.effect && ` Без поправки: ${EFFECT_LABELS[g.outcome]}.`}
                {g.correctionNote && ` Исправление: ${g.correctionNote}`}
                <Override r={r} />
                <GreenHint rollId={r.id} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
