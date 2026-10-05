import { useCallback, useEffect, useState } from 'react';
import type { GmScene, HintCheck } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';

export function GmTable() {
  return (
    <>
      <Scenes />
    </>
  );
}

type Check = { status: HintCheck['status']; others: HintCheck['others'] };

function Scenes() {
  const [list, setList] = useState<GmScene[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<GmScene[]>('GET', '/api/gm/scenes');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('gm:scenes.changed', () => void load());

  const create = async () => {
    const r = await api<GmScene>('POST', '/api/gm/scenes', { title: 'Новая сцена', textPublic: '', textGm: '' });
    if (r.ok) setList((l) => [r.data, ...l]);
    else setError('Не создалось');
  };
  const hide = async () => {
    await api('POST', '/api/gm/table/show', { sceneId: null });
  };
  const anyShown = list.some((s) => s.shown);

  return (
    <>
      <section className="card">
        <div className="row spread">
          <h2>Сцены для стола</h2>
          <div className="row">
            {anyShown && (
              <button type="button" className="btn btn-ghost" onClick={hide}>
                Убрать со стола
              </button>
            )}
            <button type="button" className="btn" onClick={create}>
              Новая
            </button>
          </div>
        </div>
        <p className="small muted">На стол уходят только название, текст для стола и картинка. Заметки мастера к сцене остаются здесь.</p>
        {error && <p className="error">{error}</p>}
      </section>
      {list.map((s) => (
        <SceneEditor key={s.id} s={s} onChange={(n) => setList((l) => l.map((x) => (x.id === n.id ? n : x)))} />
      ))}
    </>
  );
}

function SceneEditor({ s, onChange }: { s: GmScene; onChange: (s: GmScene) => void }) {
  const [title, setTitle] = useState(s.title);
  const [textPublic, setPublic] = useState(s.textPublic);
  const [textGm, setGm] = useState(s.textGm);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setTitle(s.title);
    setPublic(s.textPublic);
    setGm(s.textGm);
  }, [s.title, s.textPublic, s.textGm]);
  const dirty = title !== s.title || textPublic !== s.textPublic || textGm !== s.textGm;

  const saveText = async () => {
    const r = await api<GmScene>('POST', `/api/gm/scenes/${s.id}`, { title, textPublic, textGm });
    if (r.ok) onChange(r.data);
    return r.ok;
  };

  // Перед показом текст для стола проверяется стражем Jev по скрытым чертам всех персонажей.
  const show = async (force: boolean) => {
    setBusy(true);
    setMsg(null);
    if (dirty && !(await saveText())) {
      setBusy(false);
      return setMsg('Не сохранилось');
    }
    if (!force && textPublic.trim()) {
      const c = await api<Check>('POST', '/api/gm/scenes/check', { text: textPublic });
      const res: Check = c.ok ? c.data : { status: 'unavailable', others: [] };
      if (res.status === 'warn' || res.status === 'unavailable') {
        setBusy(false);
        return setCheck(res);
      }
    }
    setCheck(null);
    await api('POST', '/api/gm/table/show', { sceneId: s.id });
    setBusy(false);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg('Загружаю…');
    let res: Response;
    try {
      res = await fetch(`/api/gm/scenes/${s.id}/image`, {
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
    onChange((await res.json()) as GmScene);
    setMsg(null);
  };

  const [confirmDel, setConfirmDel] = useState(false);
  const remove = async () => {
    if (!confirmDel) return setConfirmDel(true);
    await api('POST', `/api/gm/scenes/${s.id}/delete`);
  };

  return (
    <section className={`card scene ${s.shown ? 'scene-shown' : ''}`}>
      {s.shown && <p className="small jev-note">Сейчас на столе</p>}
      <label className="field">
        <span>Название</span>
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>Текст для стола</span>
        <textarea rows={3} value={textPublic} maxLength={4000} onChange={(e) => setPublic(e.target.value)} />
      </label>
      <label className="field">
        <span>Заметки мастера к сцене (на стол не уходят)</span>
        <textarea rows={3} value={textGm} maxLength={20000} onChange={(e) => setGm(e.target.value)} />
      </label>
      {s.image && (
        <div className="scene-img">
          <img src={s.image.url} alt="" width={s.image.w} height={s.image.h} loading="lazy" />
          <span className="small muted">
            {s.image.w}×{s.image.h}, {Math.round(s.image.bytes / 1024)} КБ
          </span>
        </div>
      )}
      <label className="btn btn-secondary file-btn">
        {s.image ? 'Заменить картинку' : 'Добавить картинку'}
        <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
      </label>
      <div className="row">
        {dirty && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={saveText}>
            Сохранить
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => show(false)}>
          {s.shown ? 'Обновить на столе' : 'Показать на столе'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy || s.shown} onClick={remove} onBlur={() => setConfirmDel(false)}>
          {confirmDel ? 'Точно удалить?' : 'Удалить'}
        </button>
      </div>
      {msg && <p className="small muted">{msg}</p>}
      {check && (
        <div className="jev-warn">
          {check.status === 'unavailable' ? (
            <p>Проверка недоступна (Jev не ответил).</p>
          ) : (
            check.others.map((o) => (
              <p key={o.traitName}>
                Текст, похоже, выдаёт скрытую черту «{o.traitName}» ({Math.round(o.probability * 100)}%).
              </p>
            ))
          )}
          <div className="row">
            <button type="button" className="btn btn-secondary" onClick={() => show(true)}>
              Показать всё равно
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setCheck(null)}>
              Поправить
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
