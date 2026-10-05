import { useCallback, useEffect, useState } from 'react';
import type { GmDiaryEntry } from '@zg/shared';
import { GmNav } from '../components/GmNav.tsx';
import { RoleScreen } from '../components/Shell.tsx';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function GmRequests() {
  return (
    <RoleScreen role="gm">
      <GmNav />
      <Requests />
    </RoleScreen>
  );
}

function Requests() {
  const [list, setList] = useState<GmDiaryEntry[] | null>(null);
  const [onlyRequests, setOnly] = useState(true);
  const load = useCallback(async () => {
    const r = await api<GmDiaryEntry[]>('GET', '/api/gm/diary');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:diary.changed', ({ entry }) =>
    setList((l) => {
      const cur = l ?? [];
      return cur.some((x) => x.id === entry.id) ? cur.map((x) => (x.id === entry.id ? entry : x)) : [entry, ...cur];
    }),
  );
  useSocketEvent('gm:diary.removed', ({ id }) => setList((l) => (l ?? []).filter((x) => x.id !== id)));

  const shown = (list ?? []).filter((e) => !onlyRequests || e.request);
  const open = (list ?? []).filter((e) => e.request && e.requestState === 'open').length;

  return (
    <section className="card">
      <div className="row spread">
        <h2>Запросы и дневники{open ? ` · открыто ${open}` : ''}</h2>
        <label className="check">
          <input type="checkbox" checked={onlyRequests} onChange={(e) => setOnly(e.target.checked)} />
          только запросы
        </label>
      </div>
      <p className="small muted">Записи «только для меня» сюда не попадают.</p>
      {list === null && <p className="muted">Загрузка…</p>}
      {list && shown.length === 0 && <p className="muted">{onlyRequests ? 'Запросов нет.' : 'Записей нет.'}</p>}
      <ul className="list">
        {shown.map((e) => (
          <DiaryItem key={e.id} e={e} />
        ))}
      </ul>
    </section>
  );
}

function DiaryItem({ e }: { e: GmDiaryEntry }) {
  const [reply, setReply] = useState(e.reply);
  const [busy, setBusy] = useState(false);
  useEffect(() => setReply(e.reply), [e.reply]);
  const send = async (close: boolean) => {
    setBusy(true);
    await api('POST', `/api/gm/diary/${encodeURIComponent(e.id)}/reply`, { reply, close });
    setBusy(false);
  };
  return (
    <li className={`diary-gm ${e.request && e.requestState === 'open' ? 'diary-open' : ''}`}>
      <div className="small muted">
        {e.characterName ?? '—'} ({e.memberName}) · {when(e.createdAt)}
        {e.request && (e.requestState === 'open' ? ' · запрос, ждёт ответа' : ' · запрос, отвечен')}
      </div>
      <p className="prewrap">{e.text}</p>
      {e.suggestions.length > 0 && (
        <p className="small jev-note">
          Похоже, нащупал: {e.suggestions.map((s) => `«${s.traitName}» (${s.score.toFixed(1)} из 3)`).join(', ')}
        </p>
      )}
      <label className="field">
        <span>Ответ игроку</span>
        <textarea rows={2} value={reply} maxLength={4000} onChange={(x) => setReply(x.target.value)} />
      </label>
      <div className="row">
        <button type="button" className="btn btn-secondary" disabled={busy || (!reply.trim() && !e.request)} onClick={() => send(true)}>
          {e.request ? 'Ответить и закрыть' : 'Ответить'}
        </button>
        {e.request && e.requestState === 'open' && (
          <button type="button" className="btn btn-ghost" disabled={busy || !reply.trim()} onClick={() => send(false)}>
            Ответить, оставить открытым
          </button>
        )}
      </div>
    </li>
  );
}
