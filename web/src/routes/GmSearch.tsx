import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { SEARCH_KINDS, SEARCH_KIND_LABELS, type GmSearchHit } from '@zg/shared';
import { api } from '../lib/api.ts';
import { Card, CardTitle, Input, Skeleton } from '../ui/index.ts';

/** Отрывок с подсветкой: найденное сервер обрамляет «[[» и «]]». */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/g);
  return (
    <span>
      {parts.map((p, i) =>
        p.startsWith('[[') && p.endsWith(']]') ? (
          <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-text">
            {p.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

/** Поиск мастера (этап 54): по всему, что видит мастер, кроме личных записей игроков и их заметок о знакомых. */
export function GmSearch() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [hits, setHits] = useState<GmSearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const t = window.setTimeout(async () => {
      const query = q.trim();
      setParams(query ? { q: query } : {}, { replace: true });
      if (!query) return setHits(null);
      setBusy(true);
      const r = await api<{ hits: GmSearchHit[] }>('GET', `/api/gm/search?q=${encodeURIComponent(query)}`);
      setBusy(false);
      if (r.ok) setHits(r.data.hits);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, setParams]);
  const groups = SEARCH_KINDS.map((k) => ({ k, list: (hits ?? []).filter((h) => h.kind === k) })).filter((g) => g.list.length);
  return (
    <>
      <Card>
        <CardTitle>Поиск</CardTitle>
        <Input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, место, слово из заметок…" aria-label="Что искать" />
        <p className="m-0 text-[13.6px] text-muted">
          Ищет по дневникам и запросам, местам, слухам, заметкам сессий, письмам, летописи, делам, противникам, персонажам и моментам — по началу слов, без учёта регистра и «ё».
          Записи «только для меня» и заметки игроков о знакомых сюда не попадают.
        </p>
      </Card>
      {busy && !hits && <Skeleton className="h-24" />}
      {hits && hits.length === 0 && (
        <Card>
          <p className="m-0 text-muted">Ничего не нашлось.</p>
        </Card>
      )}
      {groups.map(({ k, list }) => (
        <Card key={k}>
          <CardTitle className="text-[1.15rem]">
            {SEARCH_KIND_LABELS[k]} · {list.length}
          </CardTitle>
          <ul className="m-0 grid list-none gap-0 p-0">
            {list.map((h) => (
              <li key={`${h.kind}:${h.ref}`} className="border-b border-solid border-border last:border-0">
                <Link to={h.link} viewTransition className="grid gap-0.5 py-2.5 text-text no-underline hover:bg-surface-2">
                  <b className="font-ui">{h.title}</b>
                  <span className="text-[14px] text-muted">
                    <Snippet text={h.snippet} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
