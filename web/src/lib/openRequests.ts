import { useCallback, useEffect, useState } from 'react';
import type { GmDiaryEntry } from '@zg/shared';
import { api } from './api.ts';
import { useConnection, useSocketEvent } from './socket.ts';

/** Сколько вопросов игроков ждут ответа: для навигации мастера. Только из того, что мастеру и так приходит. */
export function useOpenRequests(): number {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    const r = await api<GmDiaryEntry[]>('GET', '/api/gm/diary');
    if (r.ok) setOpen(new Set(r.data.filter((e) => e.request && e.requestState === 'open').map((e) => e.id)));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:diary.changed', ({ entry }) =>
    setOpen((s) => {
      const next = new Set(s);
      if (entry.request && entry.requestState === 'open') next.add(entry.id);
      else next.delete(entry.id);
      return next;
    }),
  );
  useSocketEvent('gm:diary.removed', ({ id }) =>
    setOpen((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    }),
  );
  return open.size;
}
