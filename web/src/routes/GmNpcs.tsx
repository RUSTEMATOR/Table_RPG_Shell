import { useCallback, useEffect, useState } from 'react';
import type { GmNpc } from '@zg/shared';
import { GmNav } from '../components/GmNav.tsx';
import { RoleScreen } from '../components/Shell.tsx';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';

export function GmNpcs() {
  return (
    <RoleScreen role="gm">
      <GmNav />
      <Npcs />
    </RoleScreen>
  );
}

/** Библиотека противников: заранее заведённые NPC, противник сессии одним нажатием, портрет на стол. */
function Npcs() {
  const [list, setList] = useState<GmNpc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<GmNpc[]>('GET', '/api/gm/npcs');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:npcs.changed', () => void load());

  const create = async () => {
    const r = await api<GmNpc>('POST', '/api/gm/npcs', { name: 'Новый противник', power: null, notes: '' });
    if (r.ok) setList((l) => [r.data, ...(l ?? [])]);
    else setError('Не создалось');
  };
  const hide = async () => {
    await api('POST', '/api/gm/table/npc', { npcId: null });
  };
  const anyShown = list?.some((n) => n.shown);

  return (
    <>
      <section className="card">
        <div className="row spread">
          <h2>Противники</h2>
          <div className="row">
            {anyShown && (
              <button type="button" className="btn btn-ghost" onClick={hide}>
                Убрать портрет со стола
              </button>
            )}
            <button type="button" className="btn" onClick={create}>
              Новый
            </button>
          </div>
        </div>
        <p className="small muted">
          Игроки противников не видят. На стол по кнопке уходят только имя и портрет; сила и заметки остаются здесь.
        </p>
        {list?.length === 0 && <p className="muted">Пока никого.</p>}
        {error && <p className="error">{error}</p>}
      </section>
      {list?.map((n) => (
        <NpcEditor key={n.id} n={n} onChange={(x) => setList((l) => (l ?? []).map((y) => (y.id === x.id ? x : y)))} />
      ))}
    </>
  );
}

function NpcEditor({ n, onChange }: { n: GmNpc; onChange: (n: GmNpc) => void }) {
  const [name, setName] = useState(n.name);
  const [power, setPower] = useState(n.power ? String(n.power) : '');
  const [notes, setNotes] = useState(n.notes);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    setName(n.name);
    setPower(n.power ? String(n.power) : '');
    setNotes(n.notes);
  }, [n.name, n.power, n.notes]);
  const p = Math.trunc(Number(power));
  const powerValue = p > 0 ? p : null;
  const dirty = name !== n.name || powerValue !== n.power || notes !== n.notes;

  const save = async () => {
    setBusy(true);
    const r = await api<GmNpc>('POST', `/api/gm/npcs/${n.id}`, { name, power: powerValue, notes });
    setBusy(false);
    if (r.ok) onChange(r.data);
    else setMsg('Не сохранилось');
    return r.ok;
  };
  const makeOpponent = async () => {
    if (dirty && !(await save())) return;
    const r = await api('POST', '/api/gm/session/opponent', { name: '', power: null, npcId: n.id });
    if (!r.ok) setMsg('Не получилось');
  };
  const show = async (on: boolean) => {
    if (on && dirty && !(await save())) return;
    await api('POST', '/api/gm/table/npc', { npcId: on ? n.id : null });
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg('Загружаю…');
    let res: Response;
    try {
      res = await fetch(`/api/gm/npcs/${n.id}/image`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': file.type || 'image/jpeg' },
        body: file,
      });
    } catch {
      setBusy(false);
      return setMsg('Нет связи');
    }
    setBusy(false);
    if (!res.ok) return setMsg('Картинка не подошла');
    onChange((await res.json()) as GmNpc);
    setMsg(null);
  };
  const remove = async () => {
    if (!confirmDel) return setConfirmDel(true);
    await api('POST', `/api/gm/npcs/${n.id}/delete`);
  };

  return (
    <section className={`card scene ${n.shown ? 'scene-shown' : ''}`}>
      {(n.opponent || n.shown) && (
        <p className="small jev-note">{[n.opponent ? 'Противник сессии' : '', n.shown ? 'Портрет на столе' : ''].filter(Boolean).join(' · ')}</p>
      )}
      <div className="grid2">
        <label className="field">
          <span>Имя</span>
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Уровень силы{n.band ? ` · ${n.band}` : ''}</span>
          <input value={power} inputMode="numeric" onChange={(e) => setPower(e.target.value.replace(/\D/g, ''))} placeholder="не задан" />
        </label>
      </div>
      <label className="field">
        <span>Заметки мастера (никуда не уходят)</span>
        <textarea rows={3} value={notes} maxLength={20000} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {n.image && (
        <div className="scene-img">
          <img src={n.image.url} alt="" width={n.image.w} height={n.image.h} loading="lazy" />
          <span className="small muted">
            {n.image.w}×{n.image.h}, {Math.round(n.image.bytes / 1024)} КБ
          </span>
        </div>
      )}
      <label className="btn btn-secondary file-btn">
        {n.image ? 'Заменить портрет' : 'Добавить портрет'}
        <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
      </label>
      <div className="row">
        {dirty && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={save}>
            Сохранить
          </button>
        )}
        {!n.opponent && (
          <button type="button" className="btn" disabled={busy} onClick={makeOpponent}>
            Сделать противником
          </button>
        )}
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => show(!n.shown)}>
          {n.shown ? 'Убрать со стола' : 'Показать на столе'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={remove} onBlur={() => setConfirmDel(false)}>
          {confirmDel ? 'Точно удалить?' : 'Удалить'}
        </button>
      </div>
      {msg && <p className="small muted">{msg}</p>}
    </section>
  );
}
