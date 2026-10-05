import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { load, save } from '../lib/storage.ts';

// Песочница Jev (этап J0): ручная проверка вопросов на своих примерах.

type Fn = 'leakGuard' | 'diaryMatch' | 'rollIntent' | 'greenMagic';

const FNS: { id: Fn; title: string; textLabel: string; traitsLabel: string | null }[] = [
  { id: 'leakGuard', title: 'Страж утечек', textLabel: 'Текст, который увидит игрок или стол', traitsLabel: 'Скрытые и намекнутые черты' },
  { id: 'diaryMatch', title: 'Дневник → черта', textLabel: 'Запись дневника', traitsLabel: 'Скрытые черты' },
  { id: 'rollIntent', title: 'Заявка → бросок', textLabel: 'Заявка действия', traitsLabel: 'Раскрытые черты персонажа' },
  { id: 'greenMagic', title: 'Зелёная магия', textLabel: 'Заявка действия', traitsLabel: null },
];

interface TraitDraft {
  name: string;
  description: string;
  hinted: boolean;
}

interface Info {
  configured: boolean;
  model: string;
  greenMagicDefinition: string;
}

type Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> };

interface AskResult {
  ms: number;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  traits: { key: string; name: string }[];
  answers: Record<string, Answer>;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const ROLL_KIND_LABELS: Record<string, string> = {
  skill_check: 'проверка d10',
  luck: 'удача d20',
  no_roll: 'без броска',
  unclear: 'неясно',
  none: 'ни одна',
};

function questionLabel(id: string, traits: AskResult['traits']): string {
  const m = /^(reveals|hint|match)_(t\d+)$/.exec(id);
  const traitName = (key: string) => traits.find((t) => t.key === key)?.name ?? key;
  if (m) {
    const [, kind, key] = m;
    const name = traitName(key!);
    if (kind === 'reveals') return `Выдаёт «${name}»`;
    if (kind === 'hint') return `Раскрытие «${name}» (0–4)`;
    return `Проявление «${name}» (0–3)`;
  }
  if (id === 'roll_kind') return 'Вид броска';
  if (id === 'trait') return 'Черта';
  if (id === 'uses_green_magic') return 'Зелёная магия';
  return id;
}

function AnswerView({ a, traits }: { a: Answer; traits: AskResult['traits'] }) {
  const label = (k: string) => ROLL_KIND_LABELS[k] ?? traits.find((t) => t.key === k)?.name ?? k;
  if (a.type === 'noul') return <span className={a.noul >= 0.5 ? 'warn' : ''}>да: {pct(a.noul)}</span>;
  if (a.type === 'score')
    return (
      <span>
        <strong>{a.score.toFixed(2)}</strong> <span className="muted small">уверенность {pct(a.confidence)}</span>
        <span className="probs">
          {Object.entries(a.probabilities).map(([k, v]) => (
            <span key={k}>
              {k}: {pct(v)}
            </span>
          ))}
        </span>
      </span>
    );
  return (
    <span>
      <strong>{label(a.choice)}</strong> <span className="muted small">уверенность {pct(a.confidence)}</span>
      <span className="probs">
        {Object.entries(a.probabilities)
          .sort((x, y) => y[1] - x[1])
          .map(([k, v]) => (
            <span key={k}>
              {label(k)}: {pct(v)}
            </span>
          ))}
      </span>
    </span>
  );
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = load(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function GmJev() {
  const [info, setInfo] = useState<Info | null>(null);
  const [fn, setFn] = useState<Fn>(() => (load('zg:jev:fn') as Fn | null) ?? 'leakGuard');
  const [text, setText] = useState(() => load('zg:jev:text') ?? '');
  const [traits, setTraits] = useState<TraitDraft[]>(() =>
    loadJson('zg:jev:traits', [{ name: '', description: '', hinted: false }]),
  );
  const [definition, setDefinition] = useState(() => load('zg:jev:greenDef') ?? '');
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Info>('GET', '/api/gm/jev/info').then((r) => {
      if (!r.ok) return;
      setInfo(r.data);
      setDefinition((d) => d || r.data.greenMagicDefinition);
    });
  }, []);

  useEffect(() => save('zg:jev:fn', fn), [fn]);
  useEffect(() => save('zg:jev:text', text), [text]);
  useEffect(() => save('zg:jev:traits', JSON.stringify(traits)), [traits]);
  useEffect(() => save('zg:jev:greenDef', definition), [definition]);

  const spec = FNS.find((f) => f.id === fn)!;
  const filled = traits.filter((t) => t.name.trim() && t.description.trim());

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    const body =
      fn === 'greenMagic'
        ? { fn, text, definition }
        : { fn, text, traits: filled.map((t) => ({ ...t, hinted: fn === 'leakGuard' && t.hinted })) };
    const r = await api<AskResult>('POST', '/api/gm/jev/ask', body);
    setBusy(false);
    if (r.ok) setResult(r.data);
    else setError(r.error === 'jev_unavailable' ? 'Jev недоступен: проверьте ключ и сеть' : `Ошибка: ${r.error}`);
  };

  const updateTrait = (i: number, patch: Partial<TraitDraft>) =>
    setTraits((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <>
      <section className="card">
        <div className="row spread">
          <h2>Песочница Jev</h2>
          <Link viewTransition to="/gm/members" className="btn btn-ghost">
            Назад
          </Link>
        </div>
        <p className="small muted">
          {info ? (info.configured ? `Модель ${info.model}.` : 'Ключ JEV_API_KEY не задан.') : ''} Каждое нажатие — один
          запрос. Ответы видит только мастер.
        </p>
        <div className="tabs">
          {FNS.map((f) => (
            <button key={f.id} className={`tab ${fn === f.id ? 'tab-on' : ''}`} onClick={() => setFn(f.id)} type="button">
              {f.title}
            </button>
          ))}
        </div>

        <form onSubmit={ask} className="stack">
          <label className="field">
            <span>{spec.textLabel}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} required />
          </label>

          {spec.traitsLabel && (
            <fieldset className="stack">
              <legend>{spec.traitsLabel}</legend>
              {traits.map((t, i) => (
                <div key={i} className="trait-draft">
                  <input placeholder="Название" value={t.name} onChange={(e) => updateTrait(i, { name: e.target.value })} />
                  <textarea
                    placeholder="Описание"
                    rows={3}
                    value={t.description}
                    onChange={(e) => updateTrait(i, { description: e.target.value })}
                  />
                  <div className="row spread">
                    {fn === 'leakGuard' ? (
                      <label className="check">
                        <input type="checkbox" checked={t.hinted} onChange={(e) => updateTrait(i, { hinted: e.target.checked })} />
                        намекнута (hinted)
                      </label>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setTraits((ts) => (ts.length > 1 ? ts.filter((_, j) => j !== i) : ts))}
                    >
                      Убрать
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setTraits((ts) => [...ts, { name: '', description: '', hinted: false }])}
              >
                Добавить черту
              </button>
            </fieldset>
          )}

          {fn === 'greenMagic' && (
            <label className="field">
              <span>Что считается зелёной магией</span>
              <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} rows={3} />
            </label>
          )}

          <button
            className="btn"
            disabled={busy || !text.trim() || (spec.id !== 'greenMagic' && spec.id !== 'rollIntent' && filled.length === 0)}
          >
            {busy ? 'Спрашиваю…' : 'Спросить'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <section className="card">
          <h2>Ответ</h2>
          <p className="small muted">
            {result.model} · {result.ms} мс · {result.usage.input_tokens} токенов на входе
          </p>
          <ul className="list">
            {Object.entries(result.answers).map(([id, a]) => (
              <li key={id} className="list-row answer-row">
                <span>{questionLabel(id, result.traits)}</span>
                <AnswerView a={a} traits={result.traits} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
