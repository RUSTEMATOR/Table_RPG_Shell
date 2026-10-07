import { lazy, Suspense } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { spring } from '../lib/motion.tsx';
import { EFFECT_LABELS } from '@zg/shared';
import { isGmRoll, useFeed, type FeedRoll } from '../lib/feed.ts';
import { EFFECT_ICON, EmptyState, GameIcon } from '../ui/GameIcon.tsx';

const Override = lazy(() => import('./FeedGm.tsx').then((x) => ({ default: x.Override })));
const GreenHint = lazy(() => import('./FeedGm.tsx').then((x) => ({ default: x.GreenHint })));

const time = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** Лента бросков. Новая строка въезжает сверху, остальные сдвигаются плавно (при «уменьшить движение» — сразу). */
export function Feed({ limit = 50, gm = false, only }: { limit?: number; gm?: boolean; only?: (r: FeedRoll) => boolean }) {
  const feed = useFeed()
    .filter((r) => !only || only(r))
    .slice(0, limit);
  if (!feed.length) return <EmptyState icon="rolling-dices">{only ? 'Своих бросков пока нет.' : 'Бросков пока нет.'}</EmptyState>;
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
                    <GameIcon name={EFFECT_ICON[r.effect]} className="mr-1.5" />
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
                  <Suspense fallback={null}>
                    <Override r={r} />
                    <GreenHint rollId={r.id} />
                  </Suspense>
                </div>
              )}
            </m.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
