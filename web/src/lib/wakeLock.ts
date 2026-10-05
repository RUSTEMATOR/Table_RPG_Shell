import { useEffect } from 'react';

// Держим экран включённым, пока экран нужен. Браузер снимает блокировку,
// когда вкладка уходит в фон, поэтому повторно запрашиваем на visibilitychange.

let sentinel: WakeLockSentinel | null = null;
let wanted = 0;

async function request() {
  if (!('wakeLock' in navigator) || sentinel || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    sentinel = null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (wanted > 0 && document.visibilityState === 'visible') void request();
  });
}

export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    wanted++;
    void request();
    return () => {
      wanted--;
      if (wanted === 0 && sentinel) {
        void sentinel.release();
        sentinel = null;
      }
    };
  }, [enabled]);
}
