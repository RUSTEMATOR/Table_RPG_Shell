import { io, type Socket } from 'socket.io-client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ClientToServerEvents, GmAck, PlayerActivity, ServerToClientEvents } from '@zg/shared';
import { BUILD_ID } from './api.ts';
import { applyWelcome, clearFeed, feedLastSeq, ingest } from './feed.ts';

export type ConnState = 'online' | 'connecting' | 'offline' | 'unauthorized';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let state: ConnState = 'connecting';
const listeners = new Set<() => void>();
const connectListeners = new Set<() => void>();

function setState(next: ConnState) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

let helloInFlight = false;
let helloAgain = false;

function hello() {
  if (!socket) return;
  if (helloInFlight) {
    helloAgain = true;
    return;
  }
  helloInFlight = true;
  socket.emit('sync:hello', { lastSeq: feedLastSeq(), buildId: BUILD_ID }, (welcome) => {
    helloInFlight = false;
    applyWelcome(welcome);
    if (helloAgain) {
      helloAgain = false;
      hello();
    }
    if (!welcome.reload) return;
    // Новая версия на сервере: перезагружаемся один раз на каждую версию.
    const key = `zg:reloaded-for:${welcome.buildId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {}
    location.reload();
  });
}

export function connectSocket() {
  if (socket) {
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io({ path: '/socket.io/', withCredentials: true });
  socket.on('connect', () => {
    setState('online');
    helloInFlight = false;
    hello();
    connectListeners.forEach((l) => l());
  });
  socket.on('disconnect', (reason) => {
    setState(navigator.onLine ? 'connecting' : 'offline');
    // Сервер сам закрыл соединение — переподключаемся вручную.
    if (reason === 'io server disconnect') socket?.connect();
  });
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') {
      setState('unauthorized');
      socket?.disconnect();
      return;
    }
    setState(navigator.onLine ? 'connecting' : 'offline');
  });
  socket.on('error:forbidden', ({ event }) => console.warn('Нет доступа к действию', event));
  socket.on('feed:event', (ev) => {
    if (ingest(ev) === 'gap') hello();
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  clearFeed();
  setState('connecting');
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (socket && !socket.connected) socket.connect();
  });
  window.addEventListener('offline', () => {
    if (socket && !socket.connected) setState('offline');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && socket && !socket.connected) socket.connect();
  });
}

export function useConnection(): ConnState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

type Events = ServerToClientEvents;

/** Подписка на событие сервера на время жизни компонента. */
export function useSocketEvent<E extends keyof Events>(event: E, handler: Events[E]) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = connectSocket();
    const fn = ((...args: unknown[]) => (ref.current as (...a: unknown[]) => void)(...args)) as Events[E];
    s.on(event, fn as never);
    return () => {
      s.off(event, fn as never);
    };
  }, [event]);
}

/** После каждого (пере)подключения. */
export function onSocketConnect(cb: () => void): () => void {
  connectListeners.add(cb);
  return () => connectListeners.delete(cb);
}

/** Активность игрока мастеру. Без связи — false: отправится после подключения. */
export function emitActivity(payload: PlayerActivity): boolean {
  if (!socket?.connected) return false;
  socket.volatile.emit('player:activity', payload);
  return true;
}

type GmEvent = 'gm:trait.setReveal' | 'gm:trait.setStage' | 'gm:trait.setTier' | 'gm:trait.setFork' | 'gm:roll.override';

/** Мастерское действие через сокет с ответом; без связи — ошибка, а не тишина. */
export function emitGm(event: GmEvent, payload: unknown): Promise<GmAck> {
  const s = connectSocket();
  return new Promise((resolve) => {
    if (!s.connected) return resolve({ ok: false, error: 'offline' });
    s.timeout(8000).emit(event, payload, (err: Error | null, res: GmAck) => {
      resolve(err ? { ok: false, error: 'timeout' } : res);
    });
  });
}

export type RollAck = { ok: true; roll: import('./feed.ts').FeedRoll } | { ok: false; error: string };

/** Запрос броска. Тот же clientRequestId при повторе даёт тот же бросок на сервере. */
export function requestRoll(payload: { clientRequestId: string; kind: 'd10' | 'd20'; visibility: string; label: string }): Promise<RollAck> {
  const s = connectSocket();
  return new Promise((resolve) => {
    s.timeout(8000).emit('roll:request', payload, (err: Error | null, res: RollAck) => {
      resolve(err ? { ok: false, error: 'timeout' } : res);
    });
  });
}
