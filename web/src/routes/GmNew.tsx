import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { QUESTIONNAIRE_LABELS, type GmQuestionnaire, type GmDraftView, type RollParamsInput } from '@zg/shared';
import { GmSlot } from '../components/GmSlot.tsx';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';
import { OWNER_ERRORS, useCatalog, usePlayers } from '../lib/gm.ts';
import { load, save } from '../lib/storage.ts';
import { cn } from '../lib/cn.ts';
import { Button, buttonVariants, Card, CardTitle, Field, Input, Segmented, Select, Skeleton, Switch, Textarea, toast } from '../ui/index.ts';

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
const NONE = '__none';
const PRONOUNS = [
  { value: 'он', label: 'он' },
  { value: 'она', label: 'она' },
  { value: 'они', label: 'они' },
];

export function GmNew() {
  const [mode, setMode] = useState<Mode>('roll');
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="grow">Новый персонаж</CardTitle>
          <Link viewTransition to="/gm/party" className={cn(buttonVariants({ variant: 'ghost' }), 'no-underline')}>
            Назад
          </Link>
        </div>
        <Segmented
          label="Как создать"
          value={mode}
          onChange={setMode}
          className="justify-self-start"
          options={[
            { value: 'roll', label: 'Попаданец' },
            { value: 'local', label: 'Местный' },
            { value: 'import', label: 'Импорт из рандомизатора' },
          ]}
        />
      </Card>
      {mode === 'roll' && <RollForm />}
      {mode === 'local' && <LocalForm />}
      {mode === 'import' && <ImportForm />}
    </>
  );
}

/** Выбор из списка с подписью. empty — подпись пустого значения (Radix не умеет пустую строку, поэтому служебное значение). */
function Pick({
  label,
  value,
  onChange,
  options,
  empty,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  empty?: string;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <Select
          id={id}
          value={value || (empty !== undefined ? NONE : '')}
          onValueChange={(v) => onChange(v === NONE ? '' : v)}
          options={[...(empty !== undefined ? [{ value: NONE, label: empty }] : []), ...options]}
        />
      )}
    </Field>
  );
}

function OwnerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const players = usePlayers();
  return <Pick label="Игрок" value={value} onChange={onChange} empty="пока никому" options={players.map((p) => ({ value: p.id, label: p.name }))} />;
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
    if (r.ok) {
      toast('Персонаж сохранён');
      navigate(`/gm/char/${r.data.id}`, { viewTransition: true });
    } else setError(OWNER_ERRORS[r.error] ?? `Не сохранилось: ${r.error}`);
  };

  if (!catalog) return <Skeleton className="h-64" />;
  const profActive = catalog.profArchs.includes(form.arch);
  const universes = catalog.universes.filter((u) => !form.source || u.genre === form.source || form.source === 'other');
  const draft = view?.draft as { seed?: string; slots?: unknown[] } | undefined;

  // анкета игрока (этап 55): подставить имя, местоимение, жанр, вселенную и владельца
  const fromQuestionnaire = (q: GmQuestionnaire) => {
    const next = { ...form, name: q.answers.name || form.name, pronoun: q.answers.pronoun, source: q.answers.source || form.source, universe: q.answers.universe };
    setForm(next);
    save(FORM_KEY, JSON.stringify({ ...next, seed: '' }));
    setOwner(q.memberId);
    toast(`Форма заполнена по анкете: ${q.memberName}`);
  };

  return (
    <>
      <Questionnaires onUse={fromQuestionnaire} />
      <Card>
        <form onSubmit={doRoll} className="grid gap-3">
          <div className="grid gap-3 @lg/main:grid-cols-2">
            <Field label="Имя">{(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={120} />}</Field>
            <Pick label="Обращение" value={form.pronoun} onChange={(v) => set('pronoun', v as typeof form.pronoun)} empty="не указано" options={PRONOUNS} />
            <Pick
              label="Откуда"
              value={form.source}
              onChange={(v) => setForm({ ...form, source: v, universe: '' })}
              options={catalog.sources.map((x) => ({ value: x.key, label: x.label }))}
            />
            <Pick
              label="Вселенная"
              value={form.universe}
              onChange={(v) => set('universe', v)}
              empty="не выбрана"
              options={universes.map((u) => ({ value: u.key, label: u.label }))}
            />
            <Pick label="Архетип в родном мире" value={form.arch} onChange={(v) => set('arch', v)} options={catalog.archs.map((a) => ({ value: a.key, label: a.label }))} />
            {profActive && (
              <Pick
                label="Профессия"
                value={form.profession}
                onChange={(v) => set('profession', v)}
                empty="не выбрана"
                options={catalog.professions.map((x) => ({ value: x.key, label: x.label }))}
              />
            )}
            {profActive && form.profession === 'other' && (
              <Field label="Своя профессия">{(id) => <Input id={id} value={form.professionText} onChange={(e) => set('professionText', e.target.value)} maxLength={80} />}</Field>
            )}
            <Field label="Сид (пусто — случайный)">
              {(id) => <Input id={id} value={form.seed} onChange={(e) => setForm({ ...form, seed: e.target.value })} maxLength={64} inputMode="numeric" className="font-mono" />}
            </Field>
          </div>
          <Switch checked={form.patron} onCheckedChange={(v) => set('patron', v)} label="Есть покровитель в старом мире" />
          <Button type="submit" variant="primary" size="lg" disabled={busy} className="justify-self-start">
            {busy ? 'Бросаю…' : view ? 'Бросить заново' : 'Бросить'}
          </Button>
        </form>
        {error && <p className="error m-0">{error}</p>}
      </Card>

      {view && (
        <>
          <Card>
            <p className="m-0 text-[13.6px] text-muted">
              Сид <span className="font-mono">{draft?.seed}</span>. Переброс меняет только один слот.
            </p>
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
          </Card>
          {view.slots.map((s) => (
            <GmSlot key={`${s.index}-${s.traitId}`} s={s}>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => call('/api/gm/roll/reroll', { draft: view.draft, index: s.index })}>
                  Перебросить
                </Button>
                {s.extra && (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => call('/api/gm/roll/remove', { draft: view.draft, index: s.index })}>
                    Убрать
                  </Button>
                )}
              </div>
            </GmSlot>
          ))}
          {view.combos.length > 0 && (
            <Card>
              <h3 className="m-0">Сочетания</h3>
              {view.combos.map((c, i) => (
                <p key={i} className="m-0">
                  {c.text}
                </p>
              ))}
            </Card>
          )}
          <Card>
            <Button className="justify-self-start" disabled={busy || (draft?.slots?.length ?? 0) >= 10} onClick={() => call('/api/gm/roll/extra', { draft: view.draft })}>
              + Случайный трейт
            </Button>
            <OwnerSelect value={owner} onChange={setOwner} />
            <Button variant="primary" size="lg" className="justify-self-start" disabled={busy} onClick={saveChar}>
              Сохранить персонажа
            </Button>
          </Card>
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
    if (r.ok) {
      toast('Персонаж создан');
      navigate(`/gm/char/${r.data.id}`, { viewTransition: true });
    } else setError(OWNER_ERRORS[r.error] ?? `Не сохранилось: ${r.error}`);
  };
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 @lg/main:grid-cols-2">
          <Field label="Имя">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />}</Field>
          <Pick label="Обращение" value={pronoun} onChange={(v) => setPronoun(v as typeof pronoun)} empty="не указано" options={PRONOUNS} />
        </div>
        <Field label="Описание для игрока">{(id) => <Textarea id={id} rows={4} value={publicBio} onChange={(e) => setBio(e.target.value)} maxLength={4000} />}</Field>
        <Field label="Заметки мастера (игрок не видит)">{(id) => <Textarea id={id} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={20000} />}</Field>
        <OwnerSelect value={owner} onChange={setOwner} />
        <Button type="submit" variant="primary" className="justify-self-start" disabled={!name.trim()}>
          Создать
        </Button>
      </form>
      {error && <p className="error m-0">{error}</p>}
    </Card>
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
    if (r.ok) {
      toast('Персонаж импортирован');
      navigate(`/gm/char/${r.data.id}`, { viewTransition: true });
    } else setError(OWNER_ERRORS[r.error] ?? r.message ?? `Не получилось: ${r.error}`);
  };
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3">
        <p className="m-0 text-[13.6px] text-muted">JSON персонажа из рандомизатора: «Экспорт» → JSON. Вставьте текст или выберите файл.</p>
        <label className={cn(buttonVariants({ size: 'sm' }), 'justify-self-start')}>
          Выбрать файл
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <Field label="JSON" error={error}>
          {(id, d) => (
            <Textarea id={id} aria-describedby={d} rows={8} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} className="font-mono text-[13px]" />
          )}
        </Field>
        <OwnerSelect value={owner} onChange={setOwner} />
        <Button type="submit" variant="primary" className="justify-self-start" disabled={!json.trim()}>
          Импортировать
        </Button>
      </form>
    </Card>
  );
}

/** Анкеты игроков без персонажа (этап 55): ответы и «Заполнить форму по анкете». */
function Questionnaires({ onUse }: { onUse: (q: GmQuestionnaire) => void }) {
  const [list, setList] = useState<GmQuestionnaire[] | null>(null);
  const load = useCallback(async () => {
    const r = await api<GmQuestionnaire[]>('GET', '/api/gm/questionnaires');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('gm:questionnaire.changed', () => void load());
  const open = (list ?? []).filter((q) => !q.hasCharacter);
  if (!open.length) return null;
  return (
    <Card>
      <CardTitle>Анкеты игроков · {open.length}</CardTitle>
      {open.map((q) => (
        <details key={q.memberId} className="group rounded-control border border-solid border-border p-3">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
            <b className="grow">
              {q.memberName}
              {q.answers.name ? ` — «${q.answers.name}»` : ''}
            </b>
            <span className="text-[12.5px] text-muted">{[q.sourceLabel, q.universeLabel, q.answers.pronoun].filter(Boolean).join(' · ')}</span>
            <Button
              size="sm"
              variant="primary"
              onClick={(e) => {
                e.preventDefault();
                onUse(q);
              }}
            >
              Заполнить форму по анкете
            </Button>
          </summary>
          <dl className="m-0 mt-2 grid gap-1.5 text-[14px]">
            {(['concept', 'past', 'wants', 'fears', 'ties', 'avoid'] as const)
              .filter((k) => q.answers[k])
              .map((k) => (
                <div key={k}>
                  <dt className="font-ui text-xs font-medium tracking-[.06em] text-muted uppercase">{QUESTIONNAIRE_LABELS[k]}</dt>
                  <dd className="prewrap m-0 font-read">{q.answers[k]}</dd>
                </div>
              ))}
          </dl>
        </details>
      ))}
    </Card>
  );
}
