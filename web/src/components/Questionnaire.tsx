import { useEffect, useState } from 'react';
import { QUESTIONNAIRE_LABELS, type QuestionnaireAnswers, type QuestionnairePlayer } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useMe } from '../lib/me.tsx';
import { load as loadPref, remove as removePref, save as savePref } from '../lib/storage.ts';
import { Button, Card, CardTitle, EmptyState, Field, Input, Segmented, Select, Skeleton, Textarea, toast } from '../ui/index.ts';
import { DictateButton } from './DictateButton.tsx';

const EMPTY: QuestionnaireAnswers = { name: '', pronoun: '', source: '', universe: '', concept: '', past: '', wants: '', fears: '', ties: '', avoid: '' };
const NONE = '__none';
const LONG: { key: keyof typeof QUESTIONNAIRE_LABELS; rows: number; max: number; hint?: string }[] = [
  { key: 'concept', rows: 2, max: 500, hint: 'Например: «бывший стражник, который не умеет врать».' },
  { key: 'past', rows: 4, max: 2000 },
  { key: 'wants', rows: 2, max: 500 },
  { key: 'fears', rows: 2, max: 500 },
  { key: 'ties', rows: 2, max: 500, hint: 'С кем из отряда знаком, кому должен, кого ищет.' },
  { key: 'avoid', rows: 2, max: 500, hint: 'Темы, которых не хочется за столом. Это увидит только мастер.' },
];

/**
 * Анкета персонажа (этап 55): пока мастер не выдал персонажа, игрок рассказывает, кого хочет играть.
 * Черновик — на устройстве; «Отправить мастеру» — на сервер (видит только мастер).
 */
export function Questionnaire() {
  const { me } = useMe();
  const key = `zg:questionnaire:${me?.member.id ?? ''}`;
  const [data, setData] = useState<QuestionnairePlayer | null>(null);
  const [a, setA] = useState<QuestionnaireAnswers>(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<QuestionnairePlayer>('GET', '/api/player/questionnaire').then((r) => {
      if (!r.ok) return;
      setData(r.data);
      let draft: Partial<QuestionnaireAnswers> = {};
      try {
        draft = JSON.parse(loadPref(key) ?? '{}') as Partial<QuestionnaireAnswers>;
      } catch {}
      setA({ ...EMPTY, ...(r.data.answers ?? {}), ...draft });
    });
  }, [key]);
  const set = <K extends keyof QuestionnaireAnswers>(k: K, v: QuestionnaireAnswers[K]) =>
    setA((cur) => {
      const next = { ...cur, [k]: v };
      savePref(key, JSON.stringify(next));
      return next;
    });
  if (!data) return <Skeleton className="h-64" />;
  const sent = data.submittedAt !== null;
  const dirty = JSON.stringify(a) !== JSON.stringify({ ...EMPTY, ...(data.answers ?? {}) });
  const universes = data.universes.filter((u) => !a.source || u.genre === a.source || a.source === 'other');
  const submit = async () => {
    setBusy(true);
    const r = await api<QuestionnairePlayer>('POST', '/api/player/questionnaire', a);
    setBusy(false);
    if (!r.ok) return toast.error(r.error === 'has_character' ? 'Мастер уже выдал персонажа' : 'Не отправилось, попробуй ещё раз');
    setData(r.data);
    removePref(key);
    toast(sent ? 'Анкета обновлена' : 'Анкета у мастера');
  };
  return (
    <Card className="zg-questionnaire">
      <EmptyState icon="hooded-figure">Мастер ещё не выдал тебе персонажа. Расскажи, кого хочешь играть, — мастер учтёт это, когда будет создавать.</EmptyState>
      <CardTitle>Анкета персонажа{sent ? ' · у мастера' : ''}</CardTitle>
      <div className="grid gap-3 @xl:grid-cols-2">
        <Field label={QUESTIONNAIRE_LABELS.name}>{(id) => <Input id={id} value={a.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />}</Field>
        <Segmented
          label="Местоимение"
          value={a.pronoun || 'none'}
          onChange={(v) => set('pronoun', v === 'none' ? '' : (v as QuestionnaireAnswers['pronoun']))}
          options={[
            { value: 'none', label: 'неважно' },
            { value: 'он', label: 'он' },
            { value: 'она', label: 'она' },
            { value: 'они', label: 'они' },
          ]}
        />
        <Field label="Жанр, откуда пришёл">
          {(id) => (
            <Select
              id={id}
              value={a.source || NONE}
              onValueChange={(v) => setA((cur) => ({ ...cur, source: v === NONE ? '' : v, universe: '' }))}
              options={[{ value: NONE, label: 'на усмотрение мастера' }, ...data.sources.map((x) => ({ value: x.key, label: x.label }))]}
            />
          )}
        </Field>
        <Field label="Вселенная (необязательно)">
          {(id) => (
            <Select
              id={id}
              value={a.universe || NONE}
              onValueChange={(v) => set('universe', v === NONE ? '' : v)}
              options={[{ value: NONE, label: '—' }, ...universes.map((u) => ({ value: u.key, label: u.label }))]}
            />
          )}
        </Field>
      </div>
      {LONG.map((f) => (
        <div key={f.key} className="grid gap-1">
          <Field label={QUESTIONNAIRE_LABELS[f.key]} hint={f.hint}>
            {(id) => <Textarea id={id} rows={f.rows} value={a[f.key]} maxLength={f.max} onChange={(e) => set(f.key, e.target.value)} />}
          </Field>
          {f.key === 'past' && <DictateButton value={a.past} onChange={(v) => set('past', v)} />}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={busy || (sent && !dirty)} onClick={() => void submit()}>
          {busy ? 'Отправляю…' : sent ? 'Сохранить правки' : 'Отправить мастеру'}
        </Button>
        <span className="text-[13px] text-muted">{sent ? 'Анкету видит только мастер. Править можно, пока персонаж не выдан.' : 'Черновик сохраняется на этом устройстве.'}</span>
      </div>
    </Card>
  );
}
