import { useEffect } from 'react';
import type { PlayerAction, PlayerActivity, PlayerTab } from '@zg/shared';
import { emitActivity, onSocketConnect } from './socket.ts';

// Что открыто у игрока — мастеру во вкладку «Активность». Только вкладка и крупное действие, без набранного текста.
// Шлётся, пока открыт экран игрока (reportTab); у мастера и стола те же компоненты ничего не шлют.

let tab: PlayerTab | null = null;
let visible = typeof document === 'undefined' || document.visibilityState === 'visible';
let seq = 0;
// Действия в порядке появления: в счёт идёт последнее на открытой вкладке (остальные вкладки пейджера живут в фоне).
const actions: { id: number; tab: PlayerTab; action: PlayerAction }[] = [];
let lastSent: string | null = null;
let timer: number | null = null;

function current(): PlayerActivity {
  const a = actions.findLast((x) => x.tab === tab);
  return { tab, visible, action: a?.action ?? null };
}

function flush() {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  if (!tab) return;
  const payload = current();
  const json = JSON.stringify(payload);
  if (json === lastSent) return;
  if (emitActivity(payload)) lastSent = json;
}

// Свайп через несколько вкладок и короткие листы не должны давать по событию на каждую.
function schedule() {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(flush, 400);
}

/** Экран игрока: открытая вкладка; null — экран закрыт, больше ничего не шлём. */
export function reportTab(next: PlayerTab | null) {
  tab = next;
  schedule();
}

/** Действие компонента на вкладке, пока он открыт; null — ничего особенного. */
export function useActivity(on: PlayerTab, action: PlayerAction | null) {
  const key = action ? JSON.stringify(action) : null;
  useEffect(() => {
    if (!action) return;
    const item = { id: ++seq, tab: on, action };
    actions.push(item);
    schedule();
    return () => {
      const i = actions.indexOf(item);
      if (i >= 0) actions.splice(i, 1);
      schedule();
    };
  }, [on, key]); // action — по содержимому
}

if (typeof window !== 'undefined') {
  // Свернули — сразу: страница может замереть раньше задержки.
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState === 'visible';
    flush();
  });
  // Новое соединение — новый сокет на сервере: сообщить заново.
  onSocketConnect(() => {
    lastSent = null;
    flush();
  });
}
