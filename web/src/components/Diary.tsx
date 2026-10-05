import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { DiaryEntryPlayer } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Дневник игрока. «Только для меня» мастер не видит; запрос мастеру не может быть личным. */
export function Diary() {
  const [entries, setEntries] = useState<DiaryEntryPlayer[] | null>(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'note' | 'private' | 'request'>('note');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ entries: DiaryEntryPlayer[] }>('GET', '/api/player/diary');
    if (r.ok) setEntries(r.data.entries);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  const upsert = (e: DiaryEntryPlayer) =>
    setEntries((l) => {
      const cur = l ?? [];
      return cur.some((x) => x.id === e.id) ? cur.map((x) => (x.id === e.id ? e : x)) : [e, ...cur];
    });
  useSocketEvent('diary:changed', ({ entry }) => upsert(entry));
  useSocketEvent('diary:removed', ({ id }) => setEntries((l) => (l ?? []).filter((x) => x.id !== id)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<DiaryEntryPlayer>('POST', '/api/player/diary', {
      text,
      private: mode === 'private',
      request: mode === 'request',
    });
    setBusy(false);
    if (!r.ok) return setError('Не сохранилось');
    upsert(r.data);
    setText('');
  };

  return (
    <section className="card">
      <h2>Дневник</h2>
      <form onSubmit={submit} className="stack">
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={8000} placeholder="Что случилось, что почувствовал, о чём догадываешься…" />
        <div className="row">
          {(
            [
              ['note', 'Запись'],
              ['private', 'Только для меня'],
              ['request', 'Вопрос мастеру'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className={`tab ${mode === k ? 'tab-on' : ''}`} onClick={() => setMode(k)}>
              {l}
            </button>
          ))}
        </div>
        <p className="small muted">
          {mode === 'private'
            ? 'Мастер эту запись не увидит.'
            : mode === 'request'
              ? 'Мастер получит запрос сразу и ответит здесь же.'
              : 'Мастер может прочитать эту запись.'}
        </p>
        <button className="btn" disabled={busy || !text.trim()}>
          Сохранить
        </button>
        {error && <p className="error">{error}</p>}
      </form>
      <ul className="list diary-list">
        {entries?.map((e) => (
          <li key={e.id} className="diary-item">
            <div className="small muted">
              {when(e.createdAt)}
              {e.private && ' · только для меня'}
              {e.request && (e.requestState === 'answered' ? ' · вопрос, есть ответ' : ' · вопрос мастеру')}
            </div>
            <p className="prewrap">{e.text}</p>
            {e.reply && (
              <p className="reply">
                <b>Мастер:</b> {e.reply}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
