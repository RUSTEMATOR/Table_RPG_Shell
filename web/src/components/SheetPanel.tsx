import { useEffect, useState } from 'react';
import { SHEET_KINDS, SHEET_TITLES, type GmCharacterView, type GmSheetEntry, type SheetKind } from '@zg/shared';
import { api } from '../lib/api.ts';

/** Лист персонажа у мастера: снаряжение, состояния, связи. Флаг «видна игроку» и заметка мастера у каждой записи. */
export function SheetPanel({ c, onChange }: { c: GmCharacterView; onChange: (c: GmCharacterView) => void }) {
  const [kind, setKind] = useState<SheetKind>('item');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const base = `/api/gm/characters/${encodeURIComponent(c.id)}/sheet`;
  const hidden = c.sheet.filter((e) => !e.visible).length;

  const add = async () => {
    setError(null);
    const r = await api<GmCharacterView>('POST', base, { kind, title, text: '', textGm: '', visible: true });
    if (!r.ok) return setError(r.error === 'too_many' ? 'Слишком много записей' : 'Не сохранилось');
    onChange(r.data);
    setTitle('');
  };

  return (
    <details className="card collapsible">
      <summary>
        <h2>Лист</h2>
        <span className="small muted">
          {c.sheet.length} {hidden ? `· скрыто ${hidden}` : ''}
        </span>
      </summary>
      {SHEET_KINDS.map((k) => {
        const list = c.sheet.filter((e) => e.kind === k);
        return (
          <div key={k} className="sheet-group">
            <h3>{SHEET_TITLES[k]}</h3>
            {list.length === 0 && <p className="small muted">Пусто.</p>}
            {list.map((e) => (
              <SheetItem key={e.id} e={e} base={base} onChange={onChange} />
            ))}
          </div>
        );
      })}
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value as SheetKind)} aria-label="Раздел">
          {SHEET_KINDS.map((k) => (
            <option key={k} value={k}>
              {SHEET_TITLES[k]}
            </option>
          ))}
        </select>
        <input value={title} maxLength={120} placeholder="Название" onChange={(e) => setTitle(e.target.value)} />
        <button type="button" className="btn btn-secondary" disabled={!title.trim()} onClick={add}>
          Добавить
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
    </details>
  );
}

function SheetItem({ e, base, onChange }: { e: GmSheetEntry; base: string; onChange: (c: GmCharacterView) => void }) {
  const [title, setTitle] = useState(e.title);
  const [text, setText] = useState(e.text);
  const [textGm, setTextGm] = useState(e.textGm);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTitle(e.title);
    setText(e.text);
    setTextGm(e.textGm);
  }, [e.title, e.text, e.textGm]);
  const dirty = title !== e.title || text !== e.text || textGm !== e.textGm;
  const url = `${base}/${encodeURIComponent(e.id)}`;

  const patch = async (body: Record<string, unknown>) => {
    setError(null);
    const r = await api<GmCharacterView>('POST', url, body);
    if (r.ok) onChange(r.data);
    else setError('Не сохранилось');
  };
  const remove = async () => {
    if (!confirmDel) return setConfirmDel(true);
    const r = await api<GmCharacterView>('POST', `${url}/delete`);
    if (r.ok) onChange(r.data);
    else setError('Не удалилось');
  };

  return (
    <div className={`sheet-entry ${e.visible ? '' : 'sheet-hidden'}`}>
      <div className="row spread">
        <input value={title} maxLength={120} onChange={(x) => setTitle(x.target.value)} aria-label="Название" />
        <label className="check">
          <input type="checkbox" checked={e.visible} onChange={(x) => patch({ visible: x.target.checked })} />
          видна игроку
        </label>
      </div>
      <textarea rows={2} value={text} maxLength={2000} placeholder="Текст для игрока" onChange={(x) => setText(x.target.value)} />
      <textarea rows={2} value={textGm} maxLength={4000} placeholder="Заметка мастера (игрок не видит)" onChange={(x) => setTextGm(x.target.value)} />
      <div className="row">
        {dirty && (
          <button type="button" className="btn btn-secondary" disabled={!title.trim()} onClick={() => patch({ title, text, textGm })}>
            Сохранить
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={remove} onBlur={() => setConfirmDel(false)}>
          {confirmDel ? 'Точно удалить?' : 'Удалить'}
        </button>
        {e.byPlayer && <span className="small muted">последним правил игрок</span>}
      </div>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
