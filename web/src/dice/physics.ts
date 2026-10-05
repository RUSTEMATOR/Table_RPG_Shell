import type { DieKind } from './geometry.ts';
import type { ThrowRequest, Trajectory } from './physics.worker.ts';

// Клиент потока физики: один поток на страницу, создаётся при первом броске.

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (t: Trajectory | null) => void>();

function get(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<Trajectory | { id: number; error: string }>) => {
    const done = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    done?.('error' in e.data ? null : e.data);
  };
  worker.onerror = () => {
    for (const done of waiting.values()) done(null);
    waiting.clear();
  };
  return worker;
}

/** Просчитать бросок: angle — откуда бросают (радианы), power 0..1 — сила щелчка. */
export function simulateThrow(kind: DieKind, angle = Math.random() * Math.PI * 2, power = 0.5): Promise<Trajectory | null> {
  const id = ++seq;
  const req: ThrowRequest = { id, kind, seed: (Math.random() * 2 ** 31) | 0, angle, power };
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    try {
      get().postMessage(req);
    } catch {
      waiting.delete(id);
      resolve(null);
    }
  });
}

/** Прогреть поток заранее (вкладка «Броски» открыта): WebAssembly грузится до первого нажатия. */
export function warmPhysics(): void {
  void simulateThrow('d10');
}

export type { Trajectory };
