import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { DiaryEntryPlayer } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useMe } from '../lib/me.tsx';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { load as loadPref, remove as removePref, save as savePref } from '../lib/storage.ts';
import { rememberReplies } from '../lib/unread.ts';

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Дневник игрока. «Только для меня» мастер не видит; запрос мастеру не может быть личным. */
// Неотправленная запись живёт на устройстве: переживает закрытие приложения и обрыв связи.
type Draft = { text: string; mode: Mode };
function readDraft(key: string): Draft {
  try {
    const d = JSON.parse(loadPref(key) ?? '') as Partial<Draft>;
    const mode = d.mode === 'private' || d.mode === 'request' ? d.mode : 'note';
    return { text: typeof d.text === 'string' ? d.text : '', mode };
  } catch {
    return { text: '', mode: 'note' };
  }
}

export function Diary() {
  const { me } = useMe();
  const draftKey = `zg:diary:draft:${me?.member.id ?? ''}`;
  const [entries, setEntries] = useState<DiaryEntryPlayer[] | null>(null);
  const [text, setText] = useState(() => readDraft(draftKey).text);
  const [mode, setMode] = useState<Mode>(() => readDraft(draftKey).mode);
  useEffect(() => {
    if (text.trim()) savePref(draftKey, JSON.stringify({ text, mode }));
    else removePref(draftKey);
  }, [draftKey, text, mode]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ entries: DiaryEntryPlayer[] }>('GET', '/api/player/diary');
    if (r.ok) {
      setEntries(r.data.entries);
      rememberReplies(r.data.entries);
    }
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
  useSocketEvent('diary:changed', ({ entry }) => {
    upsert(entry);
    rememberReplies([entry]);
  });
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
          {MODES.map(([k, l]) => (
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
          <DiaryItem key={e.id} e={e} onSaved={upsert} onRemoved={(id) => setEntries((l) => (l ?? []).filter((x) => x.id !== id))} />
        ))}
      </ul>
    </section>
  );
}

type Mode = 'note' | 'private' | 'request';
const MODES = [
  ['note', 'Запись'],
  ['private', 'Только для меня'],
  ['request', 'Вопрос мастеру'],
] as const;
const modeOf = (e: DiaryEntryPlayer): Mode => (e.request ? 'request' : e.private ? 'private' : 'note');

/** Запись дневника: просмотр, правка, удаление. Вопрос с ответом мастера остаётся вопросом. */
function DiaryItem({ e, onSaved, onRemoved }: { e: DiaryEntryPlayer; onSaved: (e: DiaryEntryPlayer) => void; onRemoved: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(e.text);
  const [mode, setMode] = useState<Mode>(modeOf(e));
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = e.request && e.requestState === 'answered';

  const open = () => {
    setText(e.text);
    setMode(modeOf(e));
    setError(null);
    setEditing(true);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await api<DiaryEntryPlayer>('POST', `/api/player/diary/${encodeURIComponent(e.id)}`, {
      text,
      private: mode === 'private',
      request: mode === 'request',
    });
    setBusy(false);
    if (!r.ok) return setError('Не сохранилось');
    onSaved(r.data);
    setEditing(false);
  };
  const remove = async () => {
    if (!confirmDel) return setConfirmDel(true);
    setBusy(true);
    const r = await api('POST', `/api/player/diary/${encodeURIComponent(e.id)}/delete`);
    setBusy(false);
    if (!r.ok) return setError('Не удалилось');
    onRemoved(e.id);
  };

  return (
    <li className="diary-item">
      <div className="small muted">
        {when(e.createdAt)}
        {e.private && ' · только для меня'}
        {e.request && (answered ? ' · вопрос, есть ответ' : ' · вопрос мастеру')}
      </div>
      {editing ? (
        <div className="stack">
          <textarea rows={4} value={text} onChange={(x) => setText(x.target.value)} maxLength={8000} />
          {!answered && (
            <div className="row">
              {MODES.map(([k, l]) => (
                <button key={k} type="button" className={`tab ${mode === k ? 'tab-on' : ''}`} onClick={() => setMode(k)}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {mode === 'private' && !e.private && <p className="small muted">Мастер перестанет видеть эту запись.</p>}
          {mode !== 'private' && e.private && <p className="small muted">Мастер сможет прочитать эту запись.</p>}
          <div className="row">
            <button type="button" className="btn btn-secondary" disabled={busy || !text.trim()} onClick={save}>
              Сохранить
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="prewrap">{e.text}</p>
          {e.reply && (
            <p className="reply">
              <b>Мастер:</b> {e.reply}
            </p>
          )}
          <div className="row">
            <button type="button" className="linkish" onClick={open}>
              Изменить
            </button>
            <button type="button" className="linkish" disabled={busy} onClick={remove} onBlur={() => setConfirmDel(false)}>
              {confirmDel ? 'Точно удалить?' : 'Удалить'}
            </button>
          </div>
        </>
      )}
      {error && <p className="error small">{error}</p>}
    </li>
  );
}
