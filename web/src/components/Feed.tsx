import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { spring } from '../lib/motion.tsx';
import { EFFECTS, EFFECT_LABELS, type Effect } from '@zg/shared';
import { isGmRoll, useFeed, type FeedRoll } from '../lib/feed.ts';
import { emitGm } from '../lib/socket.ts';
import { api } from '../lib/api.ts';
import { dismissGreen, useGreenSuggestions } from '../lib/suggestions.ts';
import { Button, Input, Select, toast } from '../ui/index.ts';

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
    <div className="mt-2 grid gap-2 rounded-control border border-solid border-border bg-surface p-3 text-text">
      <div className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)]">
        <Select aria-label="Исход" value={effect} onValueChange={(v) => setEffect(v as Effect)} options={EFFECTS.map((k) => ({ value: k, label: EFFECT_LABELS[k] }))} />
        <Input aria-label="Почему" placeholder="Почему (видит только мастер)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={async () => {
            const res = await emitGm('gm:roll.override', { rollId: r.id, effect, note });
            if (res.ok) {
              setOpen(false);
              toast('Бросок исправлен');
            } else setErr(res.error ?? 'ошибка');
          }}
        >
          Сохранить
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
      {err && <p className="error m-0">{err}</p>}
    </div>
  );
}

function GreenHint({ rollId }: { rollId: string }) {
  const green = useGreenSuggestions().get(rollId);
  if (!green) return null;
  return (
    <div className="jev-note row">
      <span>Похоже на зелёную магию ({Math.round(green.probability * 100)}%).</span>
      <Button
        size="sm"
        onClick={async () => {
          const r = await api('POST', `/api/gm/overload/${encodeURIComponent(green.characterId)}`, { delta: 1 });
          if (r.ok) {
            dismissGreen(rollId);
            toast('+1 перегрузки');
          }
        }}
      >
        +1 перегрузки
      </Button>
      <Button size="sm" variant="ghost" onClick={() => dismissGreen(rollId)}>
        Нет
      </Button>
    </div>
  );
}

/** Лента бросков. Новая строка въезжает сверху, остальные сдвигаются плавно (при «уменьшить движение» — сразу). */
export function Feed({ limit = 50, gm = false, only }: { limit?: number; gm?: boolean; only?: (r: FeedRoll) => boolean }) {
  const feed = useFeed()
    .filter((r) => !only || only(r))
    .slice(0, limit);
  if (!feed.length) return <p className="muted">{only ? 'Своих бросков пока нет.' : 'Бросков пока нет.'}</p>;
  return (
    <ul className="feed">
      <AnimatePresence initial={false}>
        {feed.map((r) => {
          const g = isGmRoll(r) ? r : null;
          const hidden = g?.visibility === 'gm_hidden';
          const priv = isGmRoll(r) ? r.visibility === 'gm_and_me' : r.private;
          return (
            <m.li
              key={r.id}
              layout="position"
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={spring.soft}
              className={`feed-row ${hidden ? 'feed-hidden' : ''}`}
            >
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
            </m.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
