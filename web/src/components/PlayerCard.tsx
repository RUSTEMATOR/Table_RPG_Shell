import { useState } from 'react';
import type { PlayerCharacter, PlayerItem, PlayerSheetNote } from '@zg/shared';
import { api } from '../lib/api.ts';

const DEMAND = ['', 'почти не нужна', 'пригодится', 'нарасхват'];

/** Карточка, как её видит игрок. Используется и в предпросмотре у мастера (там onChange не передаётся — правки нет). */
export function PlayerCard({ c, onChange }: { c: PlayerCharacter; onChange?: (c: PlayerCharacter) => void }) {
  const sub = [c.origin, c.pronoun !== 'не указано' ? c.pronoun : '', c.powerBand ? `Уровень силы: ${c.powerBand}` : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="pcard">
      <div>
        <h2 className="pcard-name">{c.name}</h2>
        {sub && <p className="muted small">{sub}</p>}
      </div>
      {c.bio && <p className="pcard-bio">{c.bio}</p>}
      {c.profession && (
        <section className="trait">
          <p className="trait-cat">Ремесло в Зеленогорье</p>
          <h3 className="trait-name">{c.profession.label}</h3>
          {c.profession.local && <p>Местный аналог: {c.profession.local}</p>}
          {c.profession.demand > 0 && <p className="small muted">Спрос: {DEMAND[c.profession.demand]}</p>}
          {c.profession.edge && <p>{c.profession.edge}</p>}
        </section>
      )}
      {c.traits.map((t, i) => (
        <section key={i} className="trait">
          <p className="trait-cat">{t.cat}</p>
          <h3 className="trait-name">{t.name}</h3>
          <p>{t.d}</p>
          {t.stagesShown.length > 0 && (
            <ol className="steps">
              {t.stagesShown.map((s, k) => (
                <li key={k}>{s}</li>
              ))}
            </ol>
          )}
          {t.price && <p className="small">Цена: {t.price}</p>}
          {t.hint && <p className="hint-note">{t.hint}</p>}
        </section>
      ))}
      {c.hints.map((h, i) => (
        <section key={`h${i}`} className="trait trait-hint">
          <p className="trait-cat">Что-то происходит</p>
          <p>{h}</p>
        </section>
      ))}
      {(c.items.length > 0 || onChange) && <Items items={c.items} onChange={onChange} />}
      <Notes title="Состояния" list={c.conditions} />
      <Notes title="Связи" list={c.relations} />
      {c.summary && (
        <section className="trait">
          <p className="trait-cat">Вступление</p>
          <p className="prewrap">{c.summary}</p>
        </section>
      )}
      {c.crossing && (
        <section className="trait">
          <p className="trait-cat">Сцена перехода</p>
          <p className="prewrap">{c.crossing}</p>
        </section>
      )}
      {c.traits.length === 0 && c.hints.length === 0 && !c.bio && c.items.length + c.conditions.length + c.relations.length === 0 && !onChange && (
        <p className="muted">Мир пока присматривается к тебе.</p>
      )}
    </div>
  );
}

function Notes({ title, list }: { title: string; list: PlayerSheetNote[] }) {
  if (!list.length) return null;
  return (
    <section className="trait">
      <p className="trait-cat">{title}</p>
      <ul className="sheet-list">
        {list.map((n, i) => (
          <li key={i}>
            <b>{n.title}</b>
            {n.text && <span className="prewrap"> — {n.text}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

type Res = { character: PlayerCharacter | null };

/** Снаряжение. Игрок правит его сам; изменения сразу видит мастер. */
function Items({ items, onChange }: { items: PlayerItem[]; onChange?: (c: PlayerCharacter) => void }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const open = (it: PlayerItem | null) => {
    setEditing(it ? it.id : 'new');
    setTitle(it?.title ?? '');
    setText(it?.text ?? '');
    setError(null);
  };
  const done = (r: Awaited<ReturnType<typeof api<Res>>>) => {
    setBusy(false);
    if (!r.ok) {
      setError('Не сохранилось');
      return false;
    }
    if (r.data.character) onChange?.(r.data.character);
    return true;
  };
  const save = async () => {
    setBusy(true);
    const url = editing === 'new' ? '/api/player/sheet/items' : `/api/player/sheet/items/${encodeURIComponent(editing ?? '')}`;
    if (done(await api<Res>('POST', url, { title, text }))) setEditing(null);
  };
  const remove = async (id: string) => {
    if (confirmDel !== id) return setConfirmDel(id);
    setBusy(true);
    done(await api<Res>('POST', `/api/player/sheet/items/${encodeURIComponent(id)}/delete`));
  };

  const form = (
    <div className="stack">
      <input value={title} maxLength={120} placeholder="Что это" onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={2} value={text} maxLength={2000} placeholder="Подробности (необязательно)" onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button type="button" className="btn btn-secondary" disabled={busy || !title.trim()} onClick={save}>
          Сохранить
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing(null)}>
          Отмена
        </button>
      </div>
    </div>
  );

  return (
    <section className="trait">
      <p className="trait-cat">Снаряжение</p>
      {items.length === 0 && !editing && <p className="small muted">Пока пусто.</p>}
      <ul className="sheet-list">
        {items.map((it) => (
          <li key={it.id}>
            {editing === it.id ? (
              form
            ) : (
              <>
                <b>{it.title}</b>
                {it.text && <span className="prewrap"> — {it.text}</span>}
                {onChange && (
                  <span className="sheet-actions">
                    <button type="button" className="linkish" onClick={() => open(it)}>
                      Изменить
                    </button>
                    <button type="button" className="linkish" disabled={busy} onClick={() => remove(it.id)} onBlur={() => setConfirmDel(null)}>
                      {confirmDel === it.id ? 'Точно удалить?' : 'Удалить'}
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' && form}
      {onChange && !editing && (
        <button type="button" className="btn btn-ghost" onClick={() => open(null)}>
          Добавить
        </button>
      )}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
