import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { GmDiaryEntry } from '@zg/shared';
import { api } from './api.ts';
import { useConnection, useSocketEvent } from './socket.ts';

// Вопросы игроков, которые ждут ответа: для навигации и правой колонки мастера. Один источник на весь макет /gm.
// Только из того, что мастеру и так приходит.

const Ctx = createContext<GmDiaryEntry[]>([]);

export function OpenRequestsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<GmDiaryEntry[]>([]);
  const load = useCallback(async () => {
    const r = await api<GmDiaryEntry[]>('GET', '/api/gm/diary');
    if (r.ok) setOpen(r.data.filter((e) => e.request && e.requestState === 'open'));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:diary.changed', ({ entry }) =>
    setOpen((l) => {
      const rest = l.filter((x) => x.id !== entry.id);
      return entry.request && entry.requestState === 'open' ? [entry, ...rest].sort((a, b) => b.createdAt - a.createdAt) : rest;
    }),
  );
  useSocketEvent('gm:diary.removed', ({ id }) => setOpen((l) => (l.some((x) => x.id === id) ? l.filter((x) => x.id !== id) : l)));
  return <Ctx.Provider value={open}>{children}</Ctx.Provider>;
}

/** Открытые вопросы игроков, новые сверху. */
export function useOpenRequests(): GmDiaryEntry[] {
  return useContext(Ctx);
}
