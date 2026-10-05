import { useCallback, useEffect, useRef, useState } from 'react';
import type { GmNote } from '@zg/shared';
import { GmNav } from '../components/GmNav.tsx';
import { RoleScreen } from '../components/Shell.tsx';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';

const SAVE_DELAY = 800;

export function GmNotes() {
  return (
    <RoleScreen role="gm">
      <GmNav />
      <Notes />
    </RoleScreen>
  );
}

type Status = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

/** Заметки сессии с автосохранением. Две вкладки мастера не затирают друг друга молча. */
function Notes() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('saved');
  const [theirs, setTheirs] = useState<GmNote | null>(null);
  const base = useRef(0);
  const latest = useRef('');
  const timer = useRef<number | null>(null);
  const dirty = useRef(false);
  const conflict = useRef(false);
  useEffect(() => {
    conflict.current = status === 'conflict';
  }, [status]);

  const load = useCallback(async () => {
    const r = await api<GmNote>('GET', '/api/gm/notes');
    if (!r.ok) return;
    if (dirty.current && r.data.updatedAt !== base.current) {
      setTheirs(r.data);
      setStatus('conflict');
      return;
    }
    if (!dirty.current) {
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

  const save = useCallback(async (value: string, over?: number) => {
    setStatus('saving');
    const r = await api<GmNote>('POST', '/api/gm/notes', { text: value, baseUpdatedAt: over ?? base.current });
    if (r.ok) {
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
      setStatus('conflict');
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
  };

  return (
    <section className="card">
      <div className="row spread">
        <h2>Заметки сессии</h2>
        <span className={`small ${status === 'error' || status === 'conflict' ? 'error' : 'muted'}`}>{label[status]}</span>
      </div>
      {status === 'conflict' && theirs && (
        <div className="conflict">
          <p className="small">Версия из другой вкладки:</p>
          <pre className="prewrap small">{theirs.text.slice(0, 2000)}</pre>
          <div className="row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                base.current = theirs.updatedAt;
                latest.current = theirs.text;
                dirty.current = false;
                setText(theirs.text);
                setTheirs(null);
                setStatus('saved');
              }}
            >
              Взять ту версию
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const over = theirs.updatedAt;
                setTheirs(null);
                void save(latest.current, over);
              }}
            >
              Оставить мою
            </button>
          </div>
        </div>
      )}
      <textarea className="notes" rows={18} value={text} onChange={(e) => onChange(e.target.value)} placeholder="Что случилось, кого встретили, что обещали…" />
    </section>
  );
}
