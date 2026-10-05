import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { GmDraftView, RollParamsInput } from '@zg/shared';
import { GmSlot } from '../components/GmSlot.tsx';
import { RoleScreen } from '../components/Shell.tsx';
import { api } from '../lib/api.ts';
import { OWNER_ERRORS, useCatalog, usePlayers } from '../lib/gm.ts';
import { load, save } from '../lib/storage.ts';

const FORM_KEY = 'zg:gm:rollForm';
const DEFAULT_FORM: Required<RollParamsInput> = {
  seed: '',
  name: '',
  pronoun: '',
  source: 'real',
  universe: '',
  arch: 'none',
  patron: false,
  profession: '',
  professionText: '',
};

function loadForm(): Required<RollParamsInput> {
  try {
    return { ...DEFAULT_FORM, ...(JSON.parse(load(FORM_KEY) ?? '{}') as Partial<RollParamsInput>) };
  } catch {
    return DEFAULT_FORM;
  }
}

type Mode = 'roll' | 'local' | 'import';

export function GmNew() {
  const [mode, setMode] = useState<Mode>('roll');
  return (
    <RoleScreen role="gm">
      <section className="card">
        <div className="row spread">
          <h2>Новый персонаж</h2>
          <Link to="/gm" className="btn btn-ghost">
            Назад
          </Link>
        </div>
        <div className="tabs">
          {(
            [
              ['roll', 'Попаданец'],
              ['local', 'Местный'],
              ['import', 'Импорт из рандомизатора'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className={`tab ${mode === k ? 'tab-on' : ''}`} onClick={() => setMode(k)}>
              {l}
            </button>
          ))}
        </div>
      </section>
      {mode === 'roll' && <RollForm />}
      {mode === 'local' && <LocalForm />}
      {mode === 'import' && <ImportForm />}
    </RoleScreen>
  );
}

function OwnerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const players = usePlayers();
  return (
    <label className="field">
      <span>Игрок</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">пока никому</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function RollForm() {
  const catalog = useCatalog();
  const navigate = useNavigate();
  const [form, setForm] = useState(loadForm);
  const [view, setView] = useState<GmDraftView | null>(null);
  const [owner, setOwner] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    const next = { ...form, [k]: v };
    setForm(next);
    save(FORM_KEY, JSON.stringify({ ...next, seed: '' }));
  };

  const call = async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const r = await api<GmDraftView>('POST', path, body);
    setBusy(false);
    if (r.ok) setView(r.data);
    else setError(`Не получилось: ${r.error}`);
  };

  const doRoll = (e: FormEvent) => {
    e.preventDefault();
    void call('/api/gm/roll', { params: form });
  };

  const saveChar = async () => {
    if (!view) return;
    setBusy(true);
    const r = await api<{ id: string }>('POST', '/api/gm/characters', { draft: view.draft, ownerMemberId: owner || null });
    setBusy(false);
    if (r.ok) navigate(`/gm/char/${r.data.id}`);
    else setError(OWNER_ERRORS[r.error] ?? `Не сохранилось: ${r.error}`);
  };

  if (!catalog) return <p className="muted">Загрузка…</p>;
  const profActive = catalog.profArchs.includes(form.arch);
  const universes = catalog.universes.filter((u) => !form.source || u.genre === form.source || form.source === 'other');
  const draft = view?.draft as { seed?: string; slots?: unknown[] } | undefined;

  return (
    <>
      <section className="card">
        <form onSubmit={doRoll} className="stack">
          <div className="grid2">
            <label className="field">
              <span>Имя</span>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={120} />
            </label>
            <label className="field">
              <span>Обращение</span>
              <select value={form.pronoun} onChange={(e) => set('pronoun', e.target.value as typeof form.pronoun)}>
                <option value="">не указано</option>
                <option value="он">он</option>
                <option value="она">она</option>
                <option value="они">они</option>
              </select>
            </label>
            <label className="field">
              <span>Откуда</span>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value, universe: '' })}>
                {catalog.sources.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Вселенная</span>
              <select value={form.universe} onChange={(e) => set('universe', e.target.value)}>
                <option value="">не выбрана</option>
                {universes.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Архетип в родном мире</span>
              <select value={form.arch} onChange={(e) => set('arch', e.target.value)}>
                {catalog.archs.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            {profActive && (
              <label className="field">
                <span>Профессия</span>
                <select value={form.profession} onChange={(e) => set('profession', e.target.value)}>
                  <option value="">не выбрана</option>
                  {catalog.professions.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {profActive && form.profession === 'other' && (
              <label className="field">
                <span>Своя профессия</span>
                <input value={form.professionText} onChange={(e) => set('professionText', e.target.value)} maxLength={80} />
              </label>
            )}
            <label className="field">
              <span>Сид (пусто — случайный)</span>
              <input value={form.seed} onChange={(e) => setForm({ ...form, seed: e.target.value })} maxLength={64} inputMode="numeric" />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.patron} onChange={(e) => set('patron', e.target.checked)} />
            Есть покровитель в старом мире
          </label>
          <button className="btn" disabled={busy}>
            {view ? 'Бросить заново' : 'Бросить'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      {view && (
        <>
          <section className="card">
            <p className="small muted">Сид {draft?.seed}. Переброс меняет только один слот.</p>
            {view.craft && (
              <div className="slot">
                <span className="trait-cat">Ремесло в Зеленогорье</span>
                <h3 className="trait-name">{view.craft.label}</h3>
                {view.craft.local && <p>Местный аналог: {view.craft.local}</p>}
                {view.craft.edge && <p>{view.craft.edge}</p>}
                {view.craft.hook && (
                  <p className="small">
                    <b>Крючок:</b> {view.craft.hook}
                  </p>
                )}
              </div>
            )}
          </section>
          {view.slots.map((s) => (
            <GmSlot key={`${s.index}-${s.traitId}`} s={s}>
              <div className="row">
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => call('/api/gm/roll/reroll', { draft: view.draft, index: s.index })}>
                  Перебросить
                </button>
                {s.extra && (
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => call('/api/gm/roll/remove', { draft: view.draft, index: s.index })}>
                    Убрать
                  </button>
                )}
              </div>
            </GmSlot>
          ))}
          {view.combos.length > 0 && (
            <section className="card">
              <h3>Сочетания</h3>
              {view.combos.map((c, i) => (
                <p key={i}>{c.text}</p>
              ))}
            </section>
          )}
          <section className="card stack">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || (draft?.slots?.length ?? 0) >= 10}
              onClick={() => call('/api/gm/roll/extra', { draft: view.draft })}
            >
              + Случайный трейт
            </button>
            <OwnerSelect value={owner} onChange={setOwner} />
            <button type="button" className="btn" disabled={busy} onClick={saveChar}>
              Сохранить персонажа
            </button>
          </section>
        </>
      )}
    </>
  );
}

function LocalForm() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [pronoun, setPronoun] = useState<'' | 'он' | 'она' | 'они'>('');
  const [publicBio, setBio] = useState('');
  const [notes, setNotes] = useState('');
  const [owner, setOwner] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await api<{ id: string }>('POST', '/api/gm/characters/local', { name, pronoun, publicBio, notes, ownerMemberId: owner || null });
    if (r.ok) navigate(`/gm/char/${r.data.id}`);
    else setError(OWNER_ERRORS[r.error] ?? `Не сохранилось: ${r.error}`);
  };
  return (
    <section className="card">
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Имя</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </label>
        <label className="field">
          <span>Обращение</span>
          <select value={pronoun} onChange={(e) => setPronoun(e.target.value as typeof pronoun)}>
            <option value="">не указано</option>
            <option value="он">он</option>
            <option value="она">она</option>
            <option value="они">они</option>
          </select>
        </label>
        <label className="field">
          <span>Описание для игрока</span>
          <textarea rows={4} value={publicBio} onChange={(e) => setBio(e.target.value)} maxLength={4000} />
        </label>
        <label className="field">
          <span>Заметки мастера (игрок не видит)</span>
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={20000} />
        </label>
        <OwnerSelect value={owner} onChange={setOwner} />
        <button className="btn" disabled={!name.trim()}>
          Создать
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function ImportForm() {
  const navigate = useNavigate();
  const [json, setJson] = useState('');
  const [owner, setOwner] = useState('');
  const [error, setError] = useState<string | null>(null);
  const onFile = async (f: File | undefined) => {
    if (f) setJson(await f.text());
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = await api<{ id: string }>('POST', '/api/gm/import', { json, ownerMemberId: owner || null });
    if (r.ok) navigate(`/gm/char/${r.data.id}`);
    else setError(OWNER_ERRORS[r.error] ?? r.message ?? `Не получилось: ${r.error}`);
  };
  return (
    <section className="card">
      <form onSubmit={submit} className="stack">
        <p className="small muted">JSON персонажа из рандомизатора: «Экспорт» → JSON. Вставьте текст или выберите файл.</p>
        <input type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} />
        <label className="field">
          <span>JSON</span>
          <textarea rows={8} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
        </label>
        <OwnerSelect value={owner} onChange={setOwner} />
        <button className="btn" disabled={!json.trim()}>
          Импортировать
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
