import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { PHOTO_MAX, QUIZ_MAX, QUIZ_OPTIONS, type GmChapter, type GmSessionItem, type QuizQuestion } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { spring } from '../lib/motion.tsx';
import { cn } from '../lib/cn.ts';
import { Badge, Button, buttonVariants, Card, CardTitle, Field, Input, Select, Skeleton, Textarea, toast } from '../ui/index.ts';
import { Pic } from '../components/Pic.tsx';
import { uploadImage } from '../lib/uploadImage.ts';

// Летопись (этап 43): мастер пишет главу по сессии (черновик — Claude), правит, составляет викторину и публикует.

const day = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const NO_SESSION = 'none';
const emptyQ = (): QuizQuestion => ({ q: '', options: Array.from({ length: QUIZ_OPTIONS }, () => ''), answer: 0 });

export function GmChronicle() {
  const [list, setList] = useState<GmChapter[] | null>(null);
  const [sessions, setSessions] = useState<GmSessionItem[]>([]);
  const [editing, setEditing] = useState<GmChapter | null>(null);
  const load = useCallback(async () => {
    const [c, s] = await Promise.all([api<GmChapter[]>('GET', '/api/gm/chronicle'), api<GmSessionItem[]>('GET', '/api/gm/sessions')]);
    if (c.ok) setList(c.data);
    if (s.ok) setSessions(s.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:chronicle.changed', () => void load());
  useSocketEvent('gm:session.changed', () => void load());

  return (
    <>
      <Editor key={editing?.id ?? 'new'} sessions={sessions} chapter={editing} onDone={() => setEditing(null)} onSaved={(c) => setEditing(c)} />
      <Card>
        <CardTitle>Главы</CardTitle>
        {list === null && <Skeleton className="h-24" />}
        {list?.length === 0 && <p className="m-0 text-muted">Глав ещё нет. После сессии — «Черновик Claude», поправить, «Опубликовать»: игрокам придёт уведомление.</p>}
        <ul className="m-0 grid list-none gap-0 p-0">
          <AnimatePresence initial={false}>
            {list?.map((c) => (
              <m.li
                key={c.id}
                layout="position"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring.soft}
                className="border-b border-solid border-border last:border-0"
              >
                <ChapterItem c={c} onEdit={() => setEditing(c)} />
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      </Card>
    </>
  );
}

function Editor({ sessions, chapter, onDone, onSaved }: { sessions: GmSessionItem[]; chapter: GmChapter | null; onDone: () => void; onSaved: (c: GmChapter) => void }) {
  const [sessionId, setSessionId] = useState<string>(chapter?.sessionId ?? sessions[0]?.id ?? NO_SESSION);
  const [title, setTitle] = useState(chapter?.title ?? '');
  const [text, setText] = useState(chapter?.text ?? '');
  const [hint, setHint] = useState('');
  const [quiz, setQuiz] = useState<QuizQuestion[]>(chapter?.quiz ?? []);
  const [busy, setBusy] = useState<'save' | 'draft' | 'quiz' | 'publish' | null>(null);
  useEffect(() => {
    if (!chapter && sessionId === NO_SESSION && sessions[0]) setSessionId(sessions[0].id);
    // первая загрузка списка сессий: подставить последнюю
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length]);

  const options = [
    ...sessions.map((s) => ({
      value: s.id,
      label: `${day(s.startedAt)}${s.endedAt ? ` — ${day(s.endedAt)}` : ' (идёт)'}${s.hasNote ? ' · заметки' : ''}${s.chapters ? ` · глав: ${s.chapters}` : ''}`,
    })),
    { value: NO_SESSION, label: 'Без сессии' },
  ];
  const quizOk = quiz.every((q) => q.q.trim() && q.options.every((o) => o.trim()));
  const can = title.trim() && text.trim() && quizOk;
  const body = () => ({ sessionId: sessionId === NO_SESSION ? null : sessionId, title, text, quiz: quiz.length ? quiz : null });

  const save = async (): Promise<GmChapter | null> => {
    const r = await api<GmChapter>('POST', chapter ? `/api/gm/chronicle/${encodeURIComponent(chapter.id)}` : '/api/gm/chronicle', body());
    if (!r.ok) {
      toast.error('Не сохранилось');
      return null;
    }
    return r.data;
  };
  const onSave = async () => {
    setBusy('save');
    const c = await save();
    setBusy(null);
    if (!c) return;
    toast(chapter ? 'Глава сохранена' : 'Черновик главы сохранён');
    onSaved(c);
  };
  const onPublish = async (on: boolean) => {
    setBusy('publish');
    const saved = await save();
    const r = saved ? await api<GmChapter>('POST', `/api/gm/chronicle/${encodeURIComponent(saved.id)}/publish`, { on }) : null;
    setBusy(null);
    if (!r?.ok) return toast.error('Не получилось');
    toast(on ? 'Глава опубликована, игрокам ушло уведомление' : 'Глава снята с публикации');
    onSaved(r.data);
  };
  const draft = async () => {
    setBusy('draft');
    const r = await api<{ title: string; text: string }>('POST', '/api/gm/chronicle/draft', { sessionId: sessionId === NO_SESSION ? null : sessionId, hint });
    setBusy(null);
    if (!r.ok) return toast.error(r.message ?? 'Черновик не получился');
    setTitle(r.data.title);
    setText(r.data.text);
    toast('Черновик в полях — поправьте и сохраните');
  };
  const quizDraft = async () => {
    setBusy('quiz');
    const saved = chapter && chapter.title === title && chapter.text === text ? chapter : await save();
    const r = saved ? await api<{ quiz: QuizQuestion[] }>('POST', `/api/gm/chronicle/${encodeURIComponent(saved.id)}/quiz-draft`) : null;
    setBusy(null);
    if (!r?.ok) return toast.error(r && !r.ok ? (r.message ?? 'Викторина не получилась') : 'Сначала сохраните главу');
    setQuiz(r.data.quiz);
    if (saved && saved !== chapter) onSaved(saved);
    toast('Вопросы в полях — проверьте верные ответы');
  };
  const setQ = (i: number, patch: Partial<QuizQuestion>) => setQuiz((qs) => qs.map((q, k) => (k === i ? { ...q, ...patch } : q)));

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle className="grow">{chapter ? `Глава: ${chapter.title}` : 'Новая глава'}</CardTitle>
        {chapter && <Badge tone={chapter.status === 'published' ? 'ok' : 'neutral'}>{chapter.status === 'published' ? 'опубликована' : 'черновик'}</Badge>}
        {chapter && (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Новая глава
          </Button>
        )}
      </div>
      <div className="grid gap-3 @xl/main:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field label="Сессия">{(id) => <Select id={id} value={sessionId} onValueChange={setSessionId} options={options} />}</Field>
        <Field label="Заголовок">{(id) => <Input id={id} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Глава о том, как…" />}</Field>
      </div>
      <div className="grid gap-2 rounded-control border border-dashed border-border p-3">
        <Field
          label="Черновик Claude: что подчеркнуть (необязательно)"
          hint="В запрос уходят канон мира, заметки этой сессии, публичные броски и записи дневников за сессию — кроме личных и вопросов мастеру. Тайны в главу Claude просят не выдавать, но проверьте текст перед публикацией."
        >
          {(id) => <Input id={id} value={hint} maxLength={2000} onChange={(e) => setHint(e.target.value)} placeholder="Главное — бой у моста и ссора в таверне" />}
        </Field>
        <Button size="sm" className="justify-self-start" disabled={busy !== null} onClick={() => void draft()}>
          {busy === 'draft' ? 'Пишу…' : 'Черновик Claude'}
        </Button>
      </div>
      <Field label="Текст главы">{(id) => <Textarea id={id} rows={14} value={text} maxLength={30000} onChange={(e) => setText(e.target.value)} />}</Field>

      {chapter ? <ChapterPhotos chapter={chapter} onChanged={onSaved} /> : <p className="m-0 text-[13.6px] text-muted">Фото сессии можно добавить, когда глава сохранена.</p>}

      <div className="grid gap-3 rounded-control border border-solid border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <b className="grow">Что ты помнишь? · {quiz.length ? `${quiz.length} ${quiz.length === 1 ? 'вопрос' : 'вопроса'}` : 'без викторины'}</b>
          <Button size="sm" disabled={busy !== null || !title.trim() || !text.trim()} onClick={() => void quizDraft()}>
            {busy === 'quiz' ? 'Составляю…' : 'Вопросы от Claude'}
          </Button>
          <Button size="sm" variant="ghost" disabled={quiz.length >= QUIZ_MAX} onClick={() => setQuiz((qs) => [...qs, emptyQ()])}>
            Добавить вопрос
          </Button>
        </div>
        {quiz.map((q, i) => (
          <div key={i} className="grid gap-2 border-t border-solid border-border pt-3">
            <Field label={`Вопрос ${i + 1}`}>{(id) => <Input id={id} value={q.q} maxLength={300} onChange={(e) => setQ(i, { q: e.target.value })} />}</Field>
            <div className="grid gap-1.5">
              {q.options.map((o, oi) => (
                <label key={oi} className="flex items-center gap-2">
                  <input type="radio" name={`q${i}`} checked={q.answer === oi} onChange={() => setQ(i, { answer: oi })} aria-label={`Верный вариант ${oi + 1}`} />
                  <Input
                    value={o}
                    maxLength={160}
                    onChange={(e) => setQ(i, { options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })}
                    placeholder={`Вариант ${oi + 1}`}
                    className="grow"
                  />
                </label>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setQuiz((qs) => qs.filter((_, k) => k !== i))}>
              Убрать вопрос
            </Button>
          </div>
        ))}
        {quiz.length > 0 && <p className="m-0 text-[13.6px] text-muted">Отметьте верный вариант у каждого вопроса. Смена вопросов стирает прежние ответы игроков.</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy !== null || !can} onClick={() => void onSave()}>
          {busy === 'save' ? 'Сохраняю…' : chapter?.status === 'published' ? 'Сохранить правки' : 'Сохранить черновик'}
        </Button>
        {chapter?.status === 'published' ? (
          <Button variant="ghost" disabled={busy !== null} onClick={() => void onPublish(false)}>
            Снять с публикации
          </Button>
        ) : (
          <Button variant="primary" disabled={busy !== null || !can} onClick={() => void onPublish(true)}>
            {busy === 'publish' ? 'Публикую…' : 'Опубликовать'}
          </Button>
        )}
      </div>
    </Card>
  );
}

function ChapterItem({ c, onEdit }: { c: GmChapter; onEdit: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(false);
  const remove = async () => {
    if (!confirm) return setConfirm(true);
    const r = await api('POST', `/api/gm/chronicle/${encodeURIComponent(c.id)}/delete`);
    if (r.ok) toast('Глава удалена');
    else toast.error('Не удалилось');
  };
  const total = c.quiz?.length ?? 0;
  return (
    <div className={cn('grid gap-2 py-4', c.status === 'published' && 'border-l-[3px] border-solid border-accent pl-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <b className="font-name text-[1.1rem]">{c.title}</b>
        <Badge tone={c.status === 'published' ? 'ok' : 'neutral'}>{c.status === 'published' ? `опубликована ${c.publishedAt ? when(c.publishedAt) : ''}` : 'черновик'}</Badge>
        {c.sessionStartedAt && <span className="text-xs text-muted">сессия {day(c.sessionStartedAt)}</span>}
        {total > 0 && <span className="text-xs text-muted">викторина · ответов: {c.answers.length}</span>}
      </div>
      <p className={cn('prewrap m-0 font-read', !open && 'line-clamp-3')}>{c.text}</p>
      {open && c.answers.length > 0 && (
        <ul className="m-0 grid list-none gap-1 p-0 text-[13.6px]">
          {c.answers.map((a, i) => (
            <li key={i}>
              {a.characterName ?? a.memberName} ({a.memberName}): {a.score} из {a.total} · {when(a.at)}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Свернуть' : 'Целиком и ответы'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Изменить
        </Button>
        <Button variant={confirm ? 'danger' : 'ghost'} size="sm" onClick={() => void remove()} onBlur={() => setConfirm(false)}>
          {confirm ? 'Точно удалить?' : 'Удалить'}
        </Button>
      </div>
    </div>
  );
}

/** Фото сессии в главе (этап 53): загрузить (можно несколько), подпись, удалить. Игроки видят, когда глава опубликована. */
function ChapterPhotos({ chapter, onChanged }: { chapter: GmChapter; onChanged: (c: GmChapter) => void }) {
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let last: GmChapter | null = null;
    for (const f of Array.from(files).slice(0, PHOTO_MAX - chapter.photos.length)) {
      try {
        const res = await uploadImage(`/api/gm/chronicle/${encodeURIComponent(chapter.id)}/photos`, f);
        if (res.ok) last = (await res.json()) as GmChapter;
        else toast.error(`«${f.name}» не загрузилось`);
      } catch {
        toast.error('Нет связи');
        break;
      }
    }
    setBusy(false);
    if (last) {
      onChanged(last);
      toast('Фото добавлены');
    }
  };
  const caption = async (pid: string, text: string) => {
    const r = await api<GmChapter>('POST', `/api/gm/chronicle/photos/${encodeURIComponent(pid)}`, { caption: text });
    if (r.ok) onChanged(r.data);
  };
  const remove = async (pid: string) => {
    const r = await api<GmChapter>('POST', `/api/gm/chronicle/photos/${encodeURIComponent(pid)}/delete`);
    if (r.ok) {
      onChanged(r.data);
      toast('Фото удалено');
    }
  };
  return (
    <div className="grid gap-2 rounded-control border border-solid border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="grow">
          Фото сессии · {chapter.photos.length} из {PHOTO_MAX}
        </b>
        <label className={cn(buttonVariants({ size: 'sm' }), (busy || chapter.photos.length >= PHOTO_MAX) && 'pointer-events-none opacity-50')}>
          {busy ? 'Загружаю…' : 'Добавить фото'}
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void upload(e.target.files)} disabled={busy} />
        </label>
      </div>
      {chapter.photos.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-0">
          {chapter.photos.map((p) => (
            <li key={p.id} className="grid gap-1">
              <Pic image={p.image} size="thumb" className="aspect-square w-full rounded-control" loading="lazy" />
              <Input
                aria-label="Подпись"
                defaultValue={p.caption}
                maxLength={200}
                placeholder="Подпись"
                onBlur={(e) => e.target.value !== p.caption && void caption(p.id, e.target.value)}
              />
              <Button size="sm" variant="ghost" onClick={() => void remove(p.id)}>
                Удалить
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-[12.5px] text-muted">Игроки видят фото, когда глава опубликована: под главой и в общем «Альбоме». Снимаете людей за столом — спросите их согласия.</p>
    </div>
  );
}
