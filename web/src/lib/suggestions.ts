import { useEffect, useSyncExternalStore } from 'react';
import type { GreenSuggestion } from '@zg/shared';
import { connectSocket } from './socket.ts';

// Подсказки Jev мастеру о зелёной магии в заявках бросков. Живут в памяти вкладки.
const map = new Map<string, GreenSuggestion>();
let snap: Map<string, GreenSuggestion> = new Map();
const listeners = new Set<() => void>();
let subscribed = false;

function emit() {
  snap = new Map(map);
  listeners.forEach((l) => l());
}

export function dismissGreen(rollId: string) {
  map.delete(rollId);
  emit();
}

export function useGreenSuggestions(): Map<string, GreenSuggestion> {
  useEffect(() => {
    if (subscribed) return;
    subscribed = true;
    connectSocket().on('gm:suggestion.green', (s) => {
      map.set(s.rollId, s);
      emit();
    });
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap,
  );
}
