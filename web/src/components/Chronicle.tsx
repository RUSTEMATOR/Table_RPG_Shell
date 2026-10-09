import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { ChapterPlayer, PhotoPlayer } from '@zg/shared';
import { Pic } from './Pic.tsx';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { rememberChapters } from '../lib/unread.ts';
import { spring } from '../lib/motion.tsx';
import { cn } from '../lib/cn.ts';
import { Button, Card, CardTitle, EmptyState, Sheet } from '../ui/index.ts';
import { Bestiary } from './Bestiary.tsx';

const when = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const excerpt = (t: string) => {
  const s = t.trim().replace(/\s+/g, ' ');
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
};

/** Летопись (этап 43): главы кампании, новые сверху; глава открывается целиком, под ней — викторина «Что ты помнишь?». */
export function Chronicle({ active = true }: { active?: boolean }) {
  const [chapters, setChapters] = useState<ChapterPlayer[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<{ chapters: ChapterPlayer[] }>('GET', '/api/player/chronicle');
    if (r.ok) setChapters(r.data.chapters);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  const upsert = (c: ChapterPlayer) =>
    setChapters((cur) => {
      const list = cur ?? [];
      const next = list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list];
      return next.sort((a, b) => b.publishedAt - a.publishedAt);
    });
  useSocketEvent('chronicle:changed', ({ chapter }) => upsert(chapter));
  useSocketEvent('chronicle:removed', ({ id }) => {
    setChapters((cur) => (cur ?? []).filter((x) => x.id !== id));
    setOpenId((o) => (o === id ? null : o));
  });
  useEffect(() => {
    if (active && chapters) rememberChapters(chapters);
  }, [active, chapters]);

  const open = openId ? (chapters?.find((c) => c.id === openId) ?? null) : null;
  if (open) return <Reader c={open} onBack={() => setOpenId(null)} onChanged={upsert} />;
  return (
    <>
      <Bestiary />
      <Album chapters={chapters ?? []} />
      <CardTitle className="text-[1.7rem]">Летопись</CardTitle>
      {chapters === null && <p className="muted">Загрузка…</p>}
      {chapters?.length === 0 && <EmptyState icon="quill-ink">Глав пока нет. После сессии мастер опубликует главу о том, что случилось, — она появится здесь.</EmptyState>}
      <ul className="m-0 grid max-w-[72ch] list-none gap-3 p-0">
        <AnimatePresence initial={false}>
          {chapters?.map((c, i) => (
            <m.li key={c.id} layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={spring.soft}>
              <Card
                as="article"
                className="zg-chapter cursor-pointer gap-1"
                onClick={() => setOpenId(c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setOpenId(c.id)}
              >
                <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">
                  Глава {(chapters?.length ?? 0) - i} · {when(c.publishedAt)}
                </span>
                <b className="font-name text-[1.25rem] leading-tight">{c.title}</b>
                <span className="text-muted">{excerpt(c.text)}</span>
                {c.quiz && <span className="text-[13px] text-accent">{c.result ? `Что ты помнишь: ${c.result.score} из ${c.result.total}` : 'Викторина «Что ты помнишь?»'}</span>}
              </Card>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </>
  );
}

function Reader({ c, onBack, onChanged }: { c: ChapterPlayer; onBack: () => void; onChanged: (c: ChapterPlayer) => void }) {
  const [picked, setPicked] = useState<(number | null)[]>(() => (c.quiz ?? []).map(() => null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPicked((c.quiz ?? []).map(() => null));
  }, [c.id, c.quiz?.length]);
  const ready = c.quiz !== null && picked.every((p) => p !== null);
  const send = async () => {
    setBusy(true);
    setError(null);
    const r = await api<ChapterPlayer>('POST', `/api/player/chronicle/${encodeURIComponent(c.id)}/answer`, { answers: picked });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'already' ? 'Ты уже отвечал(а) на эту викторину.' : 'Не отправилось, попробуй ещё раз.');
    onChanged(r.data);
  };
  return (
    <article className="zg-chapter-read grid max-w-[72ch] gap-3">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Все главы
        </Button>
      </div>
      <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">{when(c.publishedAt)}</span>
      <h2 className="m-0 font-name text-[1.8rem] leading-tight">{c.title}</h2>
      <p className="prewrap m-0 font-read text-[1.08rem] leading-relaxed">{c.text}</p>
      {c.photos.length > 0 && <Photos photos={c.photos} />}
      {c.quiz && (
        <Card className="mt-2 gap-3">
          <CardTitle>Что ты помнишь?</CardTitle>
          {c.result && (
            <p className="m-0 rounded-control border-l-[3px] border-solid border-accent bg-accent-soft px-3 py-2">
              <b>
                {c.result.score} из {c.result.total}
              </b>
              {c.result.score === c.result.total ? ' — помнишь всё.' : c.result.score === 0 ? ' — перечитай главу.' : ' — неплохо.'}
            </p>
          )}
          <ol className="m-0 grid list-none gap-4 p-0">
            {c.quiz.map((q, qi) => {
              const mine = c.result ? c.result.answers[qi] : picked[qi];
              const correct = c.result ? c.result.correct[qi] : null;
              return (
                <li key={qi} className="grid gap-2">
                  <p className="m-0 font-medium">
                    {qi + 1}. {q.q}
                  </p>
                  <div className="grid gap-1.5">
                    {q.options.map((o, oi) => {
                      const on = mine === oi;
                      const tone = c.result
                        ? oi === correct
                          ? 'border-ok bg-ok-soft text-ok'
                          : on
                            ? 'border-danger bg-danger-soft text-danger'
                            : 'border-border text-muted'
                        : on
                          ? 'border-accent bg-accent-soft'
                          : 'border-border hover:bg-surface-2';
                      return (
                        <button
                          key={oi}
                          type="button"
                          disabled={!!c.result || busy}
                          aria-pressed={on}
                          onClick={() => setPicked((p) => p.map((v, i) => (i === qi ? oi : v)))}
                          className={cn(
                            'cursor-pointer rounded-control border border-solid bg-transparent px-3 py-2 text-left font-ui text-[15px] transition-colors disabled:cursor-default',
                            tone,
                          )}
                        >
                          {o}
                          {c.result && oi === correct ? ' ✓' : ''}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
          {!c.result && (
            <>
              <Button variant="primary" className="justify-self-start" disabled={!ready || busy} onClick={() => void send()}>
                {busy ? 'Отправляю…' : 'Ответить'}
              </Button>
              <p className="m-0 text-[13.6px] text-muted">Ответить можно один раз. Результат увидит мастер.</p>
            </>
          )}
          {error && <p className="error m-0 small">{error}</p>}
        </Card>
      )}
    </article>
  );
}

/** Фото сессии (этап 53): сетка превью с размытым плейсхолдером; нажатие — фото целиком с подписью. */
function Photos({ photos, title }: { photos: PhotoPlayer[]; title?: (p: PhotoPlayer) => string }) {
  const [open, setOpen] = useState<PhotoPlayer | null>(null);
  return (
    <>
      <ul className="zg-photos m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 p-0">
        {photos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpen(p)}
              className="block w-full cursor-pointer overflow-hidden rounded-control border-0 bg-transparent p-0"
              aria-label={p.caption || 'Фото'}
            >
              <Pic image={p.image} size="thumb" className="aspect-square w-full" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      <Sheet
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? (title?.(open) ?? (open.caption || 'Фото')) : ''}
        description={open && title && open.caption ? open.caption : undefined}
      >
        {open && <Pic image={open.image} className="w-full rounded-control" imgClassName="h-auto w-full object-contain" />}
      </Sheet>
    </>
  );
}

/** Альбом кампании (этап 53): все фото опубликованных глав, новые сверху. Нет фото — нет альбома. */
function Album({ chapters }: { chapters: ChapterPlayer[] }) {
  const photos = chapters.flatMap((c) => c.photos.map((p) => ({ ...p, chapter: c.title })));
  if (!photos.length) return null;
  const titleOf = new Map(photos.map((p) => [p.id, p.chapter]));
  return (
    <Card className="zg-album gap-2">
      <CardTitle>Альбом · {photos.length}</CardTitle>
      <Photos photos={photos.slice(0, 48)} title={(p) => titleOf.get(p.id) ?? 'Фото'} />
    </Card>
  );
}
