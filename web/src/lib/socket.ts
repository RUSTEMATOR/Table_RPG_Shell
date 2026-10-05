import { io, type Socket } from 'socket.io-client';
import { useSyncExternalStore } from 'react';
import type { ClientToServerEvents, ServerToClientEvents } from '@zg/shared';
import { BUILD_ID } from './api.ts';

export type ConnState = 'online' | 'connecting' | 'offline' | 'unauthorized';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let state: ConnState = 'connecting';
const listeners = new Set<() => void>();

function setState(next: ConnState) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

function hello() {
  socket?.emit('sync:hello', { lastSeq: 0, buildId: BUILD_ID }, (welcome) => {
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
    hello();
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
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
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
