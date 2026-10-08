import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { GmCharacterListItem, GmLetter, LetterStatus } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { spring } from '../lib/motion.tsx';
import { cn } from '../lib/cn.ts';
import { Badge, Button, Card, CardTitle, Field, Input, Segmented, Select, Skeleton, Textarea, toast } from '../ui/index.ts';

// Письма персонажам (этап 42): мастер пишет от лица жителя мира, назначает доставку, видит прочтение и ответ.

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const STATUS: Record<LetterStatus, { label: string; tone: 'neutral' | 'accent' | 'ok' | 'warn' }> = {
  scheduled: { label: 'ждёт', tone: 'warn' },
  delivered: { label: 'доставлено', tone: 'neutral' },
  read: { label: 'прочитано', tone: 'accent' },
  replied: { label: 'есть ответ', tone: 'ok' },
};

/** Значение для <input type="datetime-local"> в местном времени. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function GmLetters() {
  const [chars, setChars] = useState<GmCharacterListItem[] | null>(null);
  const [list, setList] = useState<GmLetter[] | null>(null);
  const [editing, setEditing] = useState<GmLetter | null>(null);
  const load = useCallback(async () => {
    const [c, l] = await Promise.all([api<GmCharacterListItem[]>('GET', '/api/gm/characters'), api<GmLetter[]>('GET', '/api/gm/letters')]);
    if (c.ok) setChars(c.data);
    if (l.ok) setList(l.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:letters.changed', () => void load());

  const players = (chars ?? []).filter((c) => c.ownerName);
  return (
    <>
      <LetterForm key={editing?.id ?? 'new'} chars={chars ?? []} players={players} letter={editing} onDone={() => setEditing(null)} />
      <Card>
        <CardTitle>Письма</CardTitle>
        {list === null && <Skeleton className="h-24" />}
        {list?.length === 0 && <p className="m-0 text-muted">Писем ещё нет. Письмо — повод игроку открыть приложение между сессиями: ему придёт уведомление.</p>}
        <ul className="m-0 grid list-none gap-0 p-0">
          <AnimatePresence initial={false}>
            {list?.map((l) => (
              <m.li
                key={l.id}
                layout="position"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring.soft}
                className="border-b border-solid border-border last:border-0"
              >
                <LetterItem l={l} onEdit={() => setEditing(l)} />
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      </Card>
    </>
  );
}

type Form = { characterId: string; fromName: string; text: string; noteGm: string; when: 'now' | 'later'; at: string; hint: string };

function LetterForm({ chars, players, letter, onDone }: { chars: GmCharacterListItem[]; players: GmCharacterListItem[]; letter: GmLetter | null; onDone: () => void }) {
  const [f, setF] = useState<Form>(() => ({
    characterId: letter?.characterId ?? '',
    fromName: letter?.fromName ?? '',
    text: letter?.text ?? '',
    noteGm: letter?.noteGm ?? '',
    when: letter && letter.deliverAt > Date.now() ? 'later' : 'now',
    at: toLocalInput(letter?.deliverAt ?? Date.now() + 24 * 3600_000),
    hint: '',
  }));
  const set =
    <K extends keyof Form>(k: K) =>
    (v: Form[K]) =>
      setF((o) => ({ ...o, [k]: v }));
  const [busy, setBusy] = useState<'save' | 'draft' | null>(null);
  const delivered = !!letter?.deliveredAt;
  const options = (players.length ? players : chars).map((c) => ({ value: c.id, label: c.ownerName ? `${c.name} (${c.ownerName})` : `${c.name} — никому не выдан` }));
  const deliverAt = f.when === 'later' ? new Date(f.at).getTime() : undefined;
  const can = f.characterId && f.fromName.trim() && f.text.trim() && (f.when === 'now' || (deliverAt && !Number.isNaN(deliverAt)));

  const save = async () => {
    setBusy('save');
    const body = letter
      ? delivered
        ? { noteGm: f.noteGm }
        : { fromName: f.fromName, text: f.text, noteGm: f.noteGm, deliverAt: f.when === 'later' ? deliverAt : Date.now() }
      : { characterId: f.characterId, fromName: f.fromName, text: f.text, noteGm: f.noteGm, ...(deliverAt ? { deliverAt } : {}) };
    const r = await api<GmLetter>('POST', letter ? `/api/gm/letters/${encodeURIComponent(letter.id)}` : '/api/gm/letters', body);
    setBusy(null);
    if (!r.ok) return toast.error('Не сохранилось');
    toast(letter ? 'Письмо изменено' : r.data.deliveredAt ? 'Письмо доставлено' : `Письмо уйдёт ${when(r.data.deliverAt)}`);
    if (!letter) setF((o) => ({ ...o, fromName: '', text: '', noteGm: '', hint: '' }));
    onDone();
  };
  const draft = async () => {
    setBusy('draft');
    const r = await api<{ text: string }>('POST', '/api/gm/letters/draft', { characterId: f.characterId, fromName: f.fromName, hint: f.hint });
    setBusy(null);
    if (!r.ok) return toast.error(r.message ?? 'Черновик не получился');
    set('text')(r.data.text);
    toast('Черновик в поле — поправьте и отправьте');
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle className="grow">{letter ? (delivered ? 'Заметка к письму' : 'Правка письма') : 'Новое письмо'}</CardTitle>
        {letter && (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Отмена
          </Button>
        )}
      </div>
      {!letter && players.length === 0 && chars.length > 0 && (
        <p className="m-0 text-[13.6px] text-warn">Ни один персонаж не выдан игроку: письмо дождётся, когда персонажа выдадут.</p>
      )}
      <div className="grid gap-3 @xl/main:grid-cols-2">
        <Field label="Кому (персонаж)">
          {(id) => (
            <Select
              id={id}
              value={f.characterId || 'none'}
              onValueChange={(v) => set('characterId')(v === 'none' ? '' : v)}
              options={[{ value: 'none', label: '— выбрать —' }, ...options]}
              className={cn(letter && 'pointer-events-none opacity-60')}
            />
          )}
        </Field>
        <Field label="От кого (как увидит игрок)">
          {(id) => (
            <Input
              id={id}
              value={f.fromName}
              maxLength={120}
              disabled={delivered}
              onChange={(e) => set('fromName')(e.target.value)}
              placeholder="Матушка, староста Раздолья, незнакомец…"
            />
          )}
        </Field>
      </div>
      {!delivered && (
        <div className="grid gap-2 rounded-control border border-dashed border-border p-3">
          <Field
            label="Черновик Claude: о чём письмо (необязательно)"
            hint="В запрос уходят канон мира, имя и открытое описание персонажа, отправитель и эта подсказка. Записи дневника — нет."
          >
            {(id) => <Input id={id} value={f.hint} maxLength={2000} onChange={(e) => set('hint')(e.target.value)} placeholder="Зовёт домой на свадьбу сестры и намекает на долг" />}
          </Field>
          <Button size="sm" className="justify-self-start" disabled={busy !== null || !f.characterId || !f.fromName.trim()} onClick={() => void draft()}>
            {busy === 'draft' ? 'Пишу…' : 'Черновик Claude'}
          </Button>
        </div>
      )}
      <Field label="Текст письма">{(id) => <Textarea id={id} rows={8} value={f.text} maxLength={8000} disabled={delivered} onChange={(e) => set('text')(e.target.value)} />}</Field>
      <Field label="Заметка мастера (игроку не уходит)">
        {(id) => <Textarea id={id} rows={2} value={f.noteGm} maxLength={4000} onChange={(e) => set('noteGm')(e.target.value)} />}
      </Field>
      {!delivered && (
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            label="Доставить"
            value={f.when}
            onChange={(v) => set('when')(v as Form['when'])}
            options={[
              { value: 'now', label: 'Сейчас' },
              { value: 'later', label: 'В назначенное время' },
            ]}
          />
          {f.when === 'later' && (
            <Input type="datetime-local" value={f.at} min={toLocalInput(Date.now())} onChange={(e) => set('at')(e.target.value)} className="w-auto" aria-label="Когда доставить" />
          )}
        </div>
      )}
      <Button variant="primary" className="justify-self-start" disabled={busy !== null || !can} onClick={() => void save()}>
        {busy === 'save' ? 'Сохраняю…' : letter ? 'Сохранить' : f.when === 'now' ? 'Отправить' : 'Запланировать'}
      </Button>
    </Card>
  );
}

function LetterItem({ l, onEdit }: { l: GmLetter; onEdit: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(false);
  const st = STATUS[l.status];
  const remove = async () => {
    if (!confirm) return setConfirm(true);
    const r = await api('POST', `/api/gm/letters/${encodeURIComponent(l.id)}/delete`);
    if (r.ok) toast('Письмо удалено');
    else toast.error('Не удалилось');
  };
  return (
    <div className={cn('grid gap-2 py-4', l.status === 'replied' && 'border-l-[3px] border-solid border-accent pl-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">
          {l.characterName}
          {l.memberName ? ` (${l.memberName})` : ' — никому не выдан'} · от {l.fromName}
        </span>
        <Badge tone={st.tone}>{st.label}</Badge>
        <span className="text-xs text-muted">{l.deliveredAt ? `доставлено ${when(l.deliveredAt)}` : `уйдёт ${when(l.deliverAt)}`}</span>
      </div>
      <p className={cn('prewrap m-0 font-read', !open && 'line-clamp-3')}>{l.text}</p>
      {l.reply && (
        <p className="m-0 rounded-control border-l-[3px] border-solid border-accent bg-accent-soft px-3 py-2">
          <b>Ответ ({l.repliedAt ? when(l.repliedAt) : ''}):</b> {l.reply}
        </p>
      )}
      {l.noteGm && <p className="m-0 text-[13.6px] text-muted">Заметка: {l.noteGm}</p>}
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Свернуть' : 'Целиком'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          {l.deliveredAt ? 'Заметка' : 'Изменить'}
        </Button>
        <Button variant={confirm ? 'danger' : 'ghost'} size="sm" onClick={() => void remove()} onBlur={() => setConfirm(false)}>
          {confirm ? 'Точно удалить?' : 'Удалить'}
        </Button>
      </div>
    </div>
  );
}
