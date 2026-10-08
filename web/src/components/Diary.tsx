import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { DiaryEntryPlayer } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useMe } from '../lib/me.tsx';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { load as loadPref, remove as removePref, save as savePref } from '../lib/storage.ts';
import { rememberReplies } from '../lib/unread.ts';
import { useActivity } from '../lib/activity.ts';
import { spring } from '../lib/motion.tsx';
import { Button, Card, CardTitle, EmptyState, Field, Segmented, Sheet, Textarea } from '../ui/index.ts';

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

type Mode = 'note' | 'private' | 'request';
const MODES: { value: Mode; label: string }[] = [
  { value: 'note', label: 'Дневник' },
  { value: 'request', label: 'Вопрос мастеру' },
  { value: 'private', label: 'Только мне' },
];
const HINT: Record<Mode, string> = {
  note: 'Мастер может прочитать эту запись.',
  request: 'Мастер получит вопрос сразу и ответит здесь же.',
  private: 'Мастер эту запись не увидит.',
};
const modeOf = (e: DiaryEntryPlayer): Mode => (e.request ? 'request' : e.private ? 'private' : 'note');

// Неотправленная запись живёт на устройстве: переживает закрытие приложения и обрыв связи.
type Draft = { text: string; mode: Mode };
function readDraft(key: string): Draft {
  try {
    const d = JSON.parse(loadPref(key) ?? '') as Partial<Draft>;
    const mode = d.mode === 'private' || d.mode === 'request' ? d.mode : 'note';
    return { text: typeof d.text === 'string' ? d.text : '', mode };
  } catch {
    return { text: '', mode: 'note' };
  }
}

/**
 * Дневник игрока: записи карточками, новая запись и правка — в листе снизу. «Только мне» мастер не видит;
 * вопрос мастеру не может быть личным. active — вкладка на экране (только тогда ответы считаются прочитанными).
 */
export function Diary({ active = true }: { active?: boolean }) {
  const { me } = useMe();
  const draftKey = `zg:diary:draft:${me?.member.id ?? ''}`;
  const [entries, setEntries] = useState<DiaryEntryPlayer[] | null>(null);
  const [draft, setDraft] = useState<Draft>(() => readDraft(draftKey));
  useEffect(() => {
    if (draft.text.trim()) savePref(draftKey, JSON.stringify(draft));
    else removePref(draftKey);
  }, [draftKey, draft]);
  // Лист: null — закрыт, 'new' — новая запись, иначе правка записи.
  const [sheet, setSheet] = useState<'new' | DiaryEntryPlayer | null>(null);
  // Мастеру — только «пишет запись»: ни вид записи, ни новая или правка (запись «Только мне» не выдаёт себя).
  useActivity('diary', sheet !== null ? { kind: 'diary.write' } : null);

  const load = useCallback(async () => {
    const r = await api<{ entries: DiaryEntryPlayer[] }>('GET', '/api/player/diary');
    if (r.ok) setEntries(r.data.entries);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  const upsert = (e: DiaryEntryPlayer) =>
    setEntries((l) => {
      const cur = l ?? [];
      return cur.some((x) => x.id === e.id) ? cur.map((x) => (x.id === e.id ? e : x)) : [e, ...cur];
    });
  const drop = (id: string) => setEntries((l) => (l ?? []).filter((x) => x.id !== id));
  useSocketEvent('diary:changed', ({ entry }) => upsert(entry));
  useSocketEvent('diary:removed', ({ id }) => drop(id));
  // Ответы считаются прочитанными, только когда вкладка на экране: иначе значок «есть новое» не появится.
  useEffect(() => {
    if (active && entries) rememberReplies(entries);
  }, [active, entries]);

  const editing = sheet && sheet !== 'new' ? sheet : null;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="text-[1.7rem]">Дневник</CardTitle>
        <Button variant="primary" onClick={() => setSheet('new')}>
          {draft.text.trim() ? 'Черновик' : 'Новая запись'}
        </Button>
      </div>
      {entries === null && <p className="muted">Загрузка…</p>}
      {entries?.length === 0 && <EmptyState icon="quill-ink">Записей пока нет. Здесь можно вести дневник персонажа и задавать вопросы мастеру.</EmptyState>}
      <ul className="m-0 grid list-none gap-3 p-0">
        <AnimatePresence initial={false}>
          {entries?.map((e) => (
            <m.li key={e.id} layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={spring.soft}>
              <Entry e={e} onEdit={() => setSheet(e)} onRemoved={drop} />
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
      <EntrySheet
        key={editing?.id ?? 'new'}
        open={sheet !== null}
        onClose={() => setSheet(null)}
        entry={editing}
        draft={draft}
        onDraft={setDraft}
        onSaved={(e) => {
          upsert(e);
          if (!editing) setDraft({ text: '', mode: draft.mode });
          setSheet(null);
        }}
      />
    </>
  );
}

/** Запись: вид, время, текст, ответ мастера; правка и удаление. */
function Entry({ e, onEdit, onRemoved }: { e: DiaryEntryPlayer; onEdit: () => void; onRemoved: (id: string) => void }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = e.request && e.requestState === 'answered';
  const kind = e.request ? (answered ? 'Вопрос мастеру · есть ответ' : 'Вопрос мастеру') : e.private ? 'Только мне' : 'Дневник';
  const remove = async () => {
    if (!confirmDel) return setConfirmDel(true);
    setBusy(true);
    const r = await api('POST', `/api/player/diary/${encodeURIComponent(e.id)}/delete`);
    setBusy(false);
    if (!r.ok) return setError('Не удалилось');
    onRemoved(e.id);
  };
  return (
    <Card as="article" className="gap-2">
      <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">
        {kind} · {when(e.createdAt)}
      </span>
      <p className="prewrap m-0">{e.text}</p>
      {e.reply && (
        <p className="m-0 rounded-control border-l-[3px] border-solid border-accent bg-accent-soft px-3 py-2">
          <b>Мастер:</b> {e.reply}
        </p>
      )}
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Изменить
        </Button>
        <Button variant={confirmDel ? 'danger' : 'ghost'} size="sm" disabled={busy} onClick={remove} onBlur={() => setConfirmDel(false)}>
          {confirmDel ? 'Точно удалить?' : 'Удалить'}
        </Button>
      </div>
      {error && <p className="error m-0 small">{error}</p>}
    </Card>
  );
}

/** Лист «Новая запись» / «Запись»: вид, текст, сохранение. Новая запись пишется в черновик на устройстве. */
function EntrySheet({
  open,
  onClose,
  entry,
  draft,
  onDraft,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  entry: DiaryEntryPlayer | null;
  draft: Draft;
  onDraft: (d: Draft) => void;
  onSaved: (e: DiaryEntryPlayer) => void;
}) {
  // Правка живёт в своём состоянии (черновик новой записи не трогает).
  const [edit, setEdit] = useState<Draft>(() => (entry ? { text: entry.text, mode: modeOf(entry) } : draft));
  const cur = entry ? edit : draft;
  const set = (d: Draft) => (entry ? setEdit(d) : onDraft(d));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = !!entry && entry.request && entry.requestState === 'answered';

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!cur.text.trim()) return;
    setBusy(true);
    setError(null);
    const body = { text: cur.text, private: cur.mode === 'private', request: cur.mode === 'request' };
    const r = entry
      ? await api<DiaryEntryPlayer>('POST', `/api/player/diary/${encodeURIComponent(entry.id)}`, body)
      : await api<DiaryEntryPlayer>('POST', '/api/player/diary', body);
    setBusy(false);
    if (!r.ok) return setError('Не сохранилось. Текст остался здесь — попробуй ещё раз.');
    onSaved(r.data);
  };

  const was = entry ? modeOf(entry) : null;
  const hint =
    was === 'private' && cur.mode !== 'private'
      ? 'Мастер сможет прочитать эту запись.'
      : was && was !== 'private' && cur.mode === 'private'
        ? 'Мастер перестанет видеть эту запись.'
        : HINT[cur.mode];
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={entry ? 'Запись' : 'Новая запись'}>
      <form onSubmit={submit} className="grid gap-3">
        {!answered && <Segmented label="Вид записи" value={cur.mode} onChange={(mode) => set({ ...cur, mode })} options={MODES} className="w-full" />}
        <Field label="Текст" hint={hint} error={error}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              rows={5}
              value={cur.text}
              maxLength={8000}
              onChange={(e) => set({ ...cur, text: e.target.value })}
              placeholder="Что случилось, что почувствовал, о чём догадываешься…"
            />
          )}
        </Field>
        {!entry && <p className="m-0 text-[13.6px] text-muted">Черновик сохраняется на телефоне, даже если пропадёт связь.</p>}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" className="flex-[2]" disabled={busy || !cur.text.trim()}>
            {busy ? 'Сохраняю…' : cur.mode === 'request' && !entry ? 'Отправить мастеру' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
