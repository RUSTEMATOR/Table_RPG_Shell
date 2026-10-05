import { useCallback, useEffect, useState } from 'react';
import type { GmDiaryEntry } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { AnimatePresence, m } from 'motion/react';
import { spring } from '../lib/motion.tsx';
import { cn } from '../lib/cn.ts';
import { Badge, Button, Card, CardTitle, Field, Segmented, Skeleton, Textarea, toast } from '../ui/index.ts';

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function GmRequests() {
  return <Requests />;
}

function Requests() {
  const [list, setList] = useState<GmDiaryEntry[] | null>(null);
  const [onlyRequests, setOnly] = useState(true);
  const load = useCallback(async () => {
    const r = await api<GmDiaryEntry[]>('GET', '/api/gm/diary');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:diary.changed', ({ entry }) =>
    setList((l) => {
      const cur = l ?? [];
      return cur.some((x) => x.id === entry.id) ? cur.map((x) => (x.id === entry.id ? entry : x)) : [entry, ...cur];
    }),
  );
  useSocketEvent('gm:diary.removed', ({ id }) => setList((l) => (l ?? []).filter((x) => x.id !== id)));

  const shown = (list ?? []).filter((e) => !onlyRequests || e.request);
  const open = (list ?? []).filter((e) => e.request && e.requestState === 'open').length;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle className="grow">Запросы и дневники{open ? ` · открыто ${open}` : ''}</CardTitle>
        <Segmented
          label="Что показывать"
          value={onlyRequests ? 'requests' : 'all'}
          onChange={(v) => setOnly(v === 'requests')}
          options={[
            { value: 'requests', label: 'Запросы' },
            { value: 'all', label: 'Все записи' },
          ]}
        />
      </div>
      <p className="m-0 text-[13.6px] text-muted">Записи «Только мне» сюда не попадают.</p>
      {list === null && <Skeleton className="h-24" />}
      {list && shown.length === 0 && <p className="m-0 text-muted">{onlyRequests ? 'Запросов нет.' : 'Записей нет.'}</p>}
      <ul className="m-0 grid list-none gap-0 p-0">
        <AnimatePresence initial={false}>
          {shown.map((e) => (
            <m.li
              key={e.id}
              layout="position"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={spring.soft}
              className="border-b border-solid border-border last:border-0"
            >
              <DiaryItem e={e} />
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  );
}

function DiaryItem({ e }: { e: GmDiaryEntry }) {
  const [reply, setReply] = useState(e.reply);
  const [busy, setBusy] = useState(false);
  useEffect(() => setReply(e.reply), [e.reply]);
  const send = async (close: boolean) => {
    setBusy(true);
    const r = await api('POST', `/api/gm/diary/${encodeURIComponent(e.id)}/reply`, { reply, close });
    setBusy(false);
    if (r.ok) toast(close && e.request ? 'Ответ отправлен, запрос закрыт' : 'Ответ отправлен');
    else toast.error('Ответ не ушёл, попробуйте ещё раз');
  };
  const isOpen = e.request && e.requestState === 'open';
  return (
    <div className={cn('grid gap-2 py-4', isOpen && 'border-l-[3px] border-solid border-accent pl-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">
          {e.characterName ?? '—'} ({e.memberName}) · {when(e.createdAt)}
        </span>
        {e.request && <Badge tone={isOpen ? 'warn' : 'ok'}>{isOpen ? 'ждёт ответа' : 'отвечен'}</Badge>}
      </div>
      <p className="prewrap m-0 font-read">{e.text}</p>
      {e.suggestions.length > 0 && (
        <p className="m-0 text-[13.6px] text-link">Похоже, нащупал: {e.suggestions.map((s) => `«${s.traitName}» (${s.score.toFixed(1)} из 3)`).join(', ')}</p>
      )}
      <Field label="Ответ игроку">{(id) => <Textarea id={id} rows={2} value={reply} maxLength={4000} onChange={(x) => setReply(x.target.value)} />}</Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={busy || (!reply.trim() && !e.request)} onClick={() => send(true)}>
          {e.request ? 'Ответить и закрыть' : 'Ответить'}
        </Button>
        {isOpen && (
          <Button size="sm" disabled={busy || !reply.trim()} onClick={() => send(false)}>
            Ответить, оставить открытым
          </Button>
        )}
      </div>
    </div>
  );
}
