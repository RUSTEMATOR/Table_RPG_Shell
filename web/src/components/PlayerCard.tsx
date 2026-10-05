import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import type { PlayerCharacter, PlayerItem, PlayerSheetNote, PlayerTrait } from '@zg/shared';
import { api } from '../lib/api.ts';
import {
  catChipHtml,
  dot,
  DEMAND_WORDS,
  ensureTheme,
  magicSpin,
  mdLite,
  mountMagic,
  ornSvg,
  pictoSvg,
  resolveTheme,
  baseTheme,
  settingThemeOf,
  themeData,
} from '../lib/cardTheme/index.ts';

// Карточка игрока в разметке артефакта «Переход в Зеленогорье» (renderPlayer, renderPubSlot): тема по вселенной или жанру,
// портрет с поворотом, орнамент, значки категорий, ступени, частицы по нажатию. HTML-помощники артефакта сами экранируют текст.

const html = (h: string) => ({ __html: h });
const Deco = () => <i className="ct-fr" aria-hidden="true" />;
const Chip = ({ k, label, st }: { k: string; label: string; st?: string }) => (
  <div className="top" dangerouslySetInnerHTML={html(catChipHtml(k, label, st))} />
);

/** Карточка, как её видит игрок. В предпросмотре у мастера onChange не передаётся (правки нет) и частиц нет (fx=false). */
export function PlayerCard({
  c,
  onChange,
  fx = true,
  theme,
  className,
}: {
  c: PlayerCharacter;
  onChange?: (c: PlayerCharacter) => void;
  fx?: boolean;
  /** Тема с учётом выбора игрока и дня/ночи; без неё — тема персонажа. */
  theme?: string;
  className?: string;
}) {
  const th = theme ?? resolveTheme(c.look);
  ensureTheme(th);
  const T = themeData(th);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fx || !ref.current) return;
    return mountMagic(ref.current, baseTheme(th), c.look.genre);
  }, [fx, th, c.look.genre]);

  const sub = [c.origin, c.pronoun !== 'не указано' ? c.pronoun : ''].filter(Boolean).join(' · ');
  const empty =
    c.traits.length === 0 && c.hints.length === 0 && !c.bio && c.items.length + c.conditions.length + c.relations.length === 0 && !onChange;
  return (
    <div ref={ref} className={cn('card-theme p-card', className)} data-ct={th} data-frame={String(T.frame)} data-seg={String(T.segment)}>
      <div className="p-head ct-head">
        <button type="button" className="p-spin" aria-label={c.portrait ? 'Повернуть портрет' : 'Повернуть знак'} onClick={(e) => magicSpin(e.currentTarget)}>
          {c.portrait ? (
            <img className="p-portrait" src={c.portrait} alt="Портрет персонажа" />
          ) : (
            <span className="p-sigil" dangerouslySetInnerHTML={html(pictoSvg(String(T.glyph || 'green')))} />
          )}
        </button>
        <div>
          <h2 className="view-title ct-title">{c.name || 'Без имени'}</h2>
          {sub && <p className="ct-sub">{sub}</p>}
          {c.powerBand && <p className="ct-sub pw-pub">Уровень силы: {c.powerBand}</p>}
        </div>
      </div>
      <div dangerouslySetInnerHTML={html(ornSvg(th))} style={{ display: 'contents' }} />
      {c.bio && (
        <Slot chip={<Chip k="doc" label="О персонаже" />}>
          <p className="prewrap">{c.bio}</p>
        </Slot>
      )}
      {c.summary && <Summary label="Вступление" text={c.summary} />}
      {c.crossing && <Summary label="Переход" text={c.crossing} />}
      {c.profession && (
        <div className="ctc craft">
          <Deco />
          <Chip k="craft" label="Ремесло в Зеленогорье" />
          <h3 className="name">{c.profession.label}</h3>
          {c.profession.local && (
            <>
              <p className="k">Местный аналог</p>
              <p>{dot(c.profession.local)}</p>
            </>
          )}
          {c.profession.demand > 0 && (
            <>
              <p className="k">Спрос</p>
              <p className="pips" role="img" aria-label={`Спрос: ${c.profession.demand} из 3, ${DEMAND_WORDS[c.profession.demand]}`}>
                {[1, 2, 3].map((k) => (
                  <i key={k} className={k <= c.profession!.demand ? 'on' : ''} />
                ))}
                <span>{DEMAND_WORDS[c.profession.demand]}</span>
              </p>
            </>
          )}
          {c.profession.edge && (
            <>
              <p className="k">Преимущество</p>
              <p>{dot(c.profession.edge)}</p>
            </>
          )}
        </div>
      )}
      <div className="result">
        {c.traits.map((t, i) => (
          <PubSlot key={i} t={t} />
        ))}
        {c.hints.map((h, i) => (
          <Slot key={`h${i}`} chip={<Chip k="" label="Что-то происходит" />}>
            <div className="note">{h}</div>
          </Slot>
        ))}
        {(c.items.length > 0 || onChange) && <Items items={c.items} onChange={onChange} />}
        <Notes title="Состояния" picto="bolt" list={c.conditions} />
        <Notes title="Связи" picto="relation" list={c.relations} />
      </div>
      {empty && <p className="hint">Мир пока присматривается к тебе.</p>}
    </div>
  );
}

function Slot({ chip, children }: { chip: ReactNode; children: ReactNode }) {
  return (
    <div className="ctc pub">
      <Deco />
      {chip}
      {children}
    </div>
  );
}

function Summary({ label, text }: { label: string; text: string }) {
  return (
    <div className="ctc ctc-sum pub-sum">
      <Deco />
      <Chip k="summary" label={label} />
      <div className="sum-body" dangerouslySetInnerHTML={html(mdLite(text))} />
    </div>
  );
}

/** Черта как renderPubSlot артефакта: значок категории, имя, суть, открытые ступени, цена, подсказка. */
function PubSlot({ t }: { t: PlayerTrait }) {
  const n = t.stagesShown.length;
  return (
    <Slot chip={<Chip k={t.catKey} label={t.cat} st={t.setting ? settingThemeOf(t.setting) : undefined} />}>
      <h2 className="name">{t.name}</h2>
      {t.d && <p>{dot(t.d)}</p>}
      <div className="stages" role="img" aria-label={`Открыто ступеней ${n} из 4`}>
        {[1, 2, 3, 4].map((k) => (
          <i key={k} className={k <= n ? 'on' : ''} />
        ))}
      </div>
      <p className="hint">Открыто ступеней: {n} из 4</p>
      {n > 0 && (
        <ol>
          {t.stagesShown.map((x, k) => (
            <li key={k}>{x}</li>
          ))}
        </ol>
      )}
      {t.price && (
        <>
          <p className="k">Цена</p>
          <p>{dot(t.price)}</p>
        </>
      )}
      {t.hint && <div className="note">{t.hint}</div>}
    </Slot>
  );
}

function Notes({ title, picto, list }: { title: string; picto: string; list: PlayerSheetNote[] }) {
  if (!list.length) return null;
  return (
    <Slot chip={<Chip k={picto} label={title} />}>
      {list.map((n, i) => (
        <div key={i}>
          <h3 className="name">{n.title}</h3>
          {n.text && <p className="prewrap">{n.text}</p>}
        </div>
      ))}
    </Slot>
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
    <Slot chip={<Chip k="block" label="Снаряжение" />}>
      {items.length === 0 && !editing && <p className="hint">Пока пусто.</p>}
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
    </Slot>
  );
}
