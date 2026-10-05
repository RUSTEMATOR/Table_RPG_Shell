import { useCallback, useEffect, useRef, useState } from 'react';
import type { GmNote, GmPastNote } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { Badge, Button, Card, CardTitle, Dialog, DialogContent, Textarea } from '../ui/index.ts';

const SAVE_DELAY = 800;

export function GmNotes() {
  return (
    <>
      <Notes />
      <PastNotes />
    </>
  );
}

type Status = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'session';

/** Заметки сессии с автосохранением. Две вкладки мастера не затирают друг друга молча. */
function Notes() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('saved');
  const [theirs, setTheirs] = useState<GmNote | null>(null);
  const base = useRef(0);
  const sessionId = useRef<string | null>(null);
  const latest = useRef('');
  const timer = useRef<number | null>(null);
  const dirty = useRef(false);
  const conflict = useRef(false);
  useEffect(() => {
    conflict.current = status === 'conflict' || status === 'session';
  }, [status]);

  const load = useCallback(async () => {
    const r = await api<GmNote>('GET', '/api/gm/notes');
    if (!r.ok) return;
    // Мастер начал новую сессию, пока здесь был несохранённый текст.
    if (dirty.current && sessionId.current && r.data.sessionId !== sessionId.current) {
      setTheirs(r.data);
      setStatus('session');
      return;
    }
    if (dirty.current && r.data.updatedAt !== base.current) {
      setTheirs(r.data);
      setStatus('conflict');
      return;
    }
    if (!dirty.current) {
      sessionId.current = r.data.sessionId;
      base.current = r.data.updatedAt;
      latest.current = r.data.text;
      setText(r.data.text);
      setStatus('saved');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:notes.changed', ({ updatedAt }) => {
    if (updatedAt !== base.current) void load();
  });
  useSocketEvent('gm:session.changed', () => void load());

  const save = useCallback(async (value: string, over?: number) => {
    setStatus('saving');
    const r = await api<GmNote>('POST', '/api/gm/notes', {
      text: value,
      baseUpdatedAt: over ?? base.current,
      ...(sessionId.current ? { sessionId: sessionId.current } : {}),
    });
    if (r.ok) {
      sessionId.current = r.data.sessionId;
      base.current = r.data.updatedAt;
      if (latest.current === value) {
        dirty.current = false;
        setStatus('saved');
      } else setStatus('dirty');
      return;
    }
    if (r.status === 409) {
      const cur = await api<GmNote>('GET', '/api/gm/notes');
      if (cur.ok) setTheirs(cur.data);
      setStatus(r.error === 'session_changed' ? 'session' : 'conflict');
    } else setStatus('error');
  }, []);

  const onChange = (v: string) => {
    setText(v);
    latest.current = v;
    dirty.current = true;
    if (status !== 'conflict') setStatus('dirty');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!conflict.current) void save(latest.current);
    }, SAVE_DELAY);
  };

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const label: Record<Status, string> = {
    saved: 'Сохранено',
    dirty: 'Есть изменения…',
    saving: 'Сохраняю…',
    error: 'Не сохранилось — нет связи? Попробую при следующей правке.',
    conflict: 'В другой вкладке заметки изменились.',
    session: 'Началась новая сессия, а здесь остался несохранённый текст.',
  };
  const isSession = status === 'session';

  const tone: Record<Status, 'ok' | 'neutral' | 'warn' | 'danger'> = { saved: 'ok', dirty: 'neutral', saving: 'neutral', error: 'danger', conflict: 'warn', session: 'warn' };
  const takeTheirs = () => {
    if (!theirs) return;
    sessionId.current = theirs.sessionId;
    base.current = theirs.updatedAt;
    latest.current = theirs.text;
    dirty.current = false;
    setText(theirs.text);
    setTheirs(null);
    setStatus('saved');
  };
  const keepMine = () => {
    if (!theirs) return;
    const over = theirs.updatedAt;
    sessionId.current = theirs.sessionId;
    setTheirs(null);
    void save(latest.current, over);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle className="grow">Заметки сессии</CardTitle>
        <Badge tone={tone[status]} role="status" aria-live="polite">
          {(status === 'saving' || status === 'dirty') && <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-current" />}
          {status === 'saved' ? 'Сохранено' : status === 'saving' ? 'Сохраняю' : status === 'dirty' ? 'Есть изменения' : status === 'error' ? 'Не сохранилось' : 'Конфликт'}
        </Badge>
      </div>
      {status === 'error' && <p className="m-0 text-[13.6px] text-danger">{label.error}</p>}
      <Textarea
        rows={18}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Что случилось, кого встретили, что обещали…"
        className="font-read text-base leading-relaxed"
      />
      <Dialog open={(status === 'conflict' || isSession) && !!theirs} onOpenChange={() => {}}>
        <DialogContent title={isSession ? 'Началась новая сессия' : 'Заметки изменились в другой вкладке'} description={label[status]} className="w-[min(560px,calc(100vw-32px))]">
          <p className="m-0 text-[13.6px] text-muted">{isSession ? 'Заметки новой сессии:' : 'Версия из другой вкладки:'}</p>
          <pre className="prewrap m-0 max-h-60 overflow-y-auto rounded-control bg-surface-2 p-3 font-read text-sm">{theirs?.text.slice(0, 2000) || '(пусто)'}</pre>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={takeTheirs}>{isSession ? 'Открыть новую, мой текст выбросить' : 'Взять ту версию'}</Button>
            <Button variant="primary" onClick={keepMine}>
              {isSession ? 'Перенести мой текст в новую' : 'Оставить мою'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const day = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Заметки прошлых сессий: только чтение. */
function PastNotes() {
  const [list, setList] = useState<GmPastNote[] | null>(null);
  const load = useCallback(async () => {
    const r = await api<GmPastNote[]>('GET', '/api/gm/notes/history');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('gm:session.changed', () => void load());
  if (!list?.length) return null;
  return (
    <Card as="section">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
          <CardTitle className="grow">Прошлые сессии</CardTitle>
          <Badge>{list.length}</Badge>
          <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <ul className="m-0 mt-3 grid list-none gap-0 p-0">
          {list.map((n) => (
            <li key={n.sessionId} className="grid gap-1 border-b border-solid border-border py-3 last:border-0">
              <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">
                {day(n.startedAt)} — {day(n.endedAt)}
              </span>
              <p className="prewrap m-0 font-read">{n.text}</p>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
