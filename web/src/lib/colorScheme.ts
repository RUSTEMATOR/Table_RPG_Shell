import { useSyncExternalStore } from 'react';
import { load, save } from './storage.ts';

// День / ночь: «Авто» — по системе, «День» и «Ночь» — принудительно (data-theme на <html>, его уже понимают все стили).
// Выбор хранится на устройстве. Темы персонажей артефакта — со своей палитрой, на них переключатель не действует.

export type Scheme = 'auto' | 'light' | 'dark';
const KEY = 'zg:scheme';
const ORDER: Scheme[] = ['auto', 'light', 'dark'];
export const SCHEME_LABEL: Record<Scheme, string> = { auto: 'Авто', light: 'День', dark: 'Ночь' };

let current: Scheme = ORDER.includes(load(KEY) as Scheme) ? (load(KEY) as Scheme) : 'auto';
const listeners = new Set<() => void>();

function apply(): void {
  const html = document.documentElement;
  if (current === 'auto') delete html.dataset.theme;
  else html.dataset.theme = current;
}
apply();

export function nextScheme(): void {
  current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!;
  save(KEY, current);
  apply();
  listeners.forEach((l) => l());
}

export function useScheme(): Scheme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
