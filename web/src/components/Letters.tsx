import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { LetterPlayer } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { rememberLetters } from '../lib/unread.ts';
import { spring } from '../lib/motion.tsx';
import { cn } from '../lib/cn.ts';
import { Button, Card, CardTitle, Field, Sheet, Textarea } from '../ui/index.ts';
import { DictateButton } from './DictateButton.tsx';

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
const firstLine = (t: string) => {
  const line = t.trim().split('\n')[0] ?? '';
  return line.length > 90 ? `${line.slice(0, 90)}…` : line;
};

/**
 * Письма персонажу (этап 42): сверху вкладки «Дневник». Открытие письма отмечает его прочитанным; «Ответить» — один ответ,
 * его можно переписать. Пока писем нет — раздела нет. active — вкладка на экране (только тогда письма считаются увиденными).
 */
export function Letters({ active = true }: { active?: boolean }) {
  const [letters, setLetters] = useState<LetterPlayer[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<{ letters: LetterPlayer[] }>('GET', '/api/player/letters');
    if (r.ok) setLetters(r.data.letters);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  const upsert = (l: LetterPlayer) =>
    setLetters((cur) => {
      const list = cur ?? [];
      return list.some((x) => x.id === l.id) ? list.map((x) => (x.id === l.id ? l : x)) : [l, ...list];
    });
  useSocketEvent('letters:changed', ({ letter }) => upsert(letter));
  useSocketEvent('letters:removed', ({ id }) => {
    setLetters((cur) => (cur ?? []).filter((x) => x.id !== id));
    setOpenId((o) => (o === id ? null : o));
  });
  useEffect(() => {
    if (active && letters) rememberLetters(letters);
  }, [active, letters]);

  if (!letters || letters.length === 0) return null;
  const unread = letters.filter((l) => !l.readAt).length;
  const open = openId ? (letters.find((l) => l.id === openId) ?? null) : null;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="text-[1.7rem]">Письма{unread ? ` · ${unread}` : ''}</CardTitle>
      </div>
      <ul className="m-0 grid max-w-[72ch] list-none gap-2 p-0">
        <AnimatePresence initial={false}>
          {letters.map((l) => (
            <m.li key={l.id} layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={spring.soft}>
              <Card
                as="article"
                className={cn('zg-letter cursor-pointer gap-1 py-3', !l.readAt && 'border-accent')}
                onClick={() => setOpenId(l.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setOpenId(l.id)}
              >
                <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">
                  {l.readAt ? 'Письмо' : 'Новое письмо'} · {when(l.deliveredAt)}
                </span>
                <b className="font-name text-[1.1rem]">От {l.from}</b>
                <span className="text-muted">{firstLine(l.text)}</span>
                {l.reply && <span className="text-[13px] text-muted">Ты ответил(а)</span>}
              </Card>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
      <LetterSheet letter={open} onClose={() => setOpenId(null)} onChanged={upsert} />
    </>
  );
}

function LetterSheet({ letter, onClose, onChanged }: { letter: LetterPlayer | null; onClose: () => void; onChanged: (l: LetterPlayer) => void }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setReplying(false);
    setText(letter?.reply ?? '');
    setError(null);
    if (letter && !letter.readAt) void api<LetterPlayer>('POST', `/api/player/letters/${encodeURIComponent(letter.id)}/read`).then((r) => r.ok && onChanged(r.data));
    // onChanged не меняется по смыслу; пересылать «прочитано» при каждом его обновлении незачем
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter?.id]);
  const send = async () => {
    if (!letter) return;
    setBusy(true);
    setError(null);
    const r = await api<LetterPlayer>('POST', `/api/player/letters/${encodeURIComponent(letter.id)}/reply`, { text });
    setBusy(false);
    if (!r.ok) return setError('Не отправилось, попробуй ещё раз.');
    onChanged(r.data);
    setReplying(false);
  };
  return (
    <Sheet open={letter !== null} onOpenChange={(o) => !o && onClose()} title={letter ? `От ${letter.from}` : ''} description={letter ? when(letter.deliveredAt) : undefined}>
      {letter && (
        <div className="grid gap-3">
          <p className="prewrap zg-letter-text m-0 font-read text-[1.05rem] leading-relaxed">{letter.text}</p>
          {letter.reply && !replying && (
            <p className="m-0 rounded-control border-l-[3px] border-solid border-accent bg-accent-soft px-3 py-2">
              <b>Твой ответ:</b> {letter.reply}
            </p>
          )}
          {replying ? (
            <>
              <Field label="Ответ" error={error}>
                {(id) => <Textarea id={id} rows={5} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder="Что ответит твой персонаж…" />}
              </Field>
              <DictateButton value={text} onChange={setText} />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setReplying(false)}>
                  Отмена
                </Button>
                <Button type="button" variant="primary" className="flex-[2]" disabled={busy || !text.trim()} onClick={() => void send()}>
                  {busy ? 'Отправляю…' : 'Отправить'}
                </Button>
              </div>
            </>
          ) : (
            <Button type="button" variant={letter.reply ? 'ghost' : 'primary'} onClick={() => setReplying(true)}>
              {letter.reply ? 'Переписать ответ' : 'Ответить'}
            </Button>
          )}
          <p className="m-0 text-[13.6px] text-muted">Ответ увидит мастер.</p>
        </div>
      )}
    </Sheet>
  );
}
