import { useEffect, useRef } from 'react';

// Горячие клавиши мастера без библиотеки. Комбинация: 'mod+k' (⌘ на Mac, Ctrl на остальных) или 'g i' (G, затем I за секунду).
// Пока курсор в поле ввода, срабатывают только комбинации с mod.

type Map = Record<string, (e: KeyboardEvent) => void>;

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function useHotkeys(map: Map): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    let prefix: { key: string; at: number } | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey) return;
      const key = e.key.toLowerCase();
      if (e.metaKey || e.ctrlKey) {
        const fn = ref.current[`mod+${key}`];
        if (fn) {
          e.preventDefault();
          fn(e);
        }
        return;
      }
      if (typing(e.target) || e.shiftKey) return;
      if (prefix && performance.now() - prefix.at < 1000) {
        const fn = ref.current[`${prefix.key} ${key}`];
        prefix = null;
        if (fn) {
          e.preventDefault();
          fn(e);
          return;
        }
      }
      if (Object.keys(ref.current).some((k) => k.startsWith(`${key} `))) prefix = { key, at: performance.now() };
      else ref.current[key]?.(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Как показать mod в подсказке: ⌘ на Mac, Ctrl на остальных. */
export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
