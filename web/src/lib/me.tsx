import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Me } from '@zg/shared';
import { api } from './api.ts';

interface MeState {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
}

const Ctx = createContext<MeState | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const r = await api<Me>('GET', '/api/me');
    const next = r.ok ? r.data : null;
    setMe(next);
    setLoading(false);
    return next;
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return <Ctx.Provider value={{ me, loading, refresh }}>{children}</Ctx.Provider>;
}

export function useMe(): MeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('MeProvider не подключён');
  return v;
}

export function homeFor(role: Me['member']['role']): string {
  return role === 'gm' ? '/gm' : role === 'table' ? '/table' : '/player';
}
