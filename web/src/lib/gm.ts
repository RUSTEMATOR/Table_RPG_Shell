import { useEffect, useState } from 'react';
import type { Catalog, GmMember } from '@zg/shared';
import { api } from './api.ts';

let catalogCache: Catalog | null = null;

export function useCatalog(): Catalog | null {
  const [c, setC] = useState<Catalog | null>(catalogCache);
  useEffect(() => {
    if (catalogCache) return;
    void api<Catalog>('GET', '/api/gm/catalog').then((r) => {
      if (r.ok) {
        catalogCache = r.data;
        setC(r.data);
      }
    });
  }, []);
  return c;
}

export function usePlayers(): GmMember[] {
  const [m, setM] = useState<GmMember[]>([]);
  useEffect(() => {
    void api<GmMember[]>('GET', '/api/gm/members').then((r) => {
      if (r.ok) setM(r.data.filter((x) => x.role === 'player'));
    });
  }, []);
  return m;
}

export const OWNER_ERRORS: Record<string, string> = {
  owner_taken: 'У этого игрока уже есть персонаж',
  owner_invalid: 'Можно выбрать только игрока этой комнаты',
};
