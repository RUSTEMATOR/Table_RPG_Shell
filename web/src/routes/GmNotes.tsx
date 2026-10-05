import { useCallback, useEffect, useRef, useState } from 'react';
import type { GmNote, GmPastNote } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';

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

  return (
    <section className="card">
      <div className="row spread">
        <h2>Заметки сессии</h2>
        <span className={`small ${status === 'error' || status === 'conflict' || isSession ? 'error' : 'muted'}`}>{label[status]}</span>
      </div>
      {(status === 'conflict' || isSession) && theirs && (
        <div className="conflict">
          <p className="small">{isSession ? 'Заметки новой сессии:' : 'Версия из другой вкладки:'}</p>
          <pre className="prewrap small">{theirs.text.slice(0, 2000) || '(пусто)'}</pre>
          <div className="row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                sessionId.current = theirs.sessionId;
                base.current = theirs.updatedAt;
                latest.current = theirs.text;
                dirty.current = false;
                setText(theirs.text);
                setTheirs(null);
                setStatus('saved');
              }}
            >
              {isSession ? 'Открыть новую, мой текст выбросить' : 'Взять ту версию'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const over = theirs.updatedAt;
                sessionId.current = theirs.sessionId;
                setTheirs(null);
                void save(latest.current, over);
              }}
            >
              {isSession ? 'Перенести мой текст в новую' : 'Оставить мою'}
            </button>
          </div>
        </div>
      )}
      <textarea className="notes" rows={18} value={text} onChange={(e) => onChange(e.target.value)} placeholder="Что случилось, кого встретили, что обещали…" />
    </section>
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
    <details className="card collapsible">
      <summary>
        <h2>Прошлые сессии</h2>
        <span className="small muted">{list.length}</span>
      </summary>
      <ul className="list">
        {list.map((n) => (
          <li key={n.sessionId}>
            <p className="small muted">
              {day(n.startedAt)} — {day(n.endedAt)}
            </p>
            <p className="prewrap">{n.text}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
