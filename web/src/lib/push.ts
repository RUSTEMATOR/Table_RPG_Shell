import { useCallback, useEffect, useState } from 'react';
import type { PushKeyResponse } from '@zg/shared';
import { api } from './api.ts';

// Push-уведомления (этап 41): подписка устройства и её состояние. Сервер шлёт только то, что игрок и так видит
// (без свободного текста); сервис-воркер показывает уведомление, лишь когда приложение не на экране (public/push-sw.js).

export type PushState =
  | 'unsupported' // браузер не умеет
  | 'need-install' // iOS: нужно добавить на экран «Домой»
  | 'disabled' // на сервере нет ключей VAPID
  | 'denied' // запрещено в настройках браузера
  | 'off'
  | 'on'
  | 'busy';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function iosNotInstalled(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

let keyCache: Promise<PushKeyResponse> | null = null;
function serverKey(): Promise<PushKeyResponse> {
  keyCache ??= api<PushKeyResponse>('GET', '/api/push/key').then((r) => (r.ok ? r.data : { enabled: false, key: null }));
  return keyCache;
}

function keyBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration().catch(() => undefined);
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'устройство';
  const browser = /CriOS|Chrome/.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /Edg/.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '';
  return browser ? `${browser} на ${device}` : device;
}

async function register(sub: PushSubscription): Promise<boolean> {
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) return false;
  const r = await api('POST', '/api/push/subscribe', { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, label: deviceLabel() });
  return r.ok;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return iosNotInstalled() ? 'need-install' : 'unsupported';
  if (!(await serverKey()).enabled) return 'disabled';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  return sub ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  const k = await serverKey();
  if (!k.enabled || !k.key) return 'disabled';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) return 'off';
  try {
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.key) as BufferSource }));
    if (!(await register(sub))) {
      await sub.unsubscribe().catch(() => undefined);
      return 'off';
    }
    return 'on';
  } catch {
    return 'off';
  }
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (sub) {
    await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe().catch(() => undefined);
  }
  return 'off';
}

/** Подписка есть — напомнить о ней серверу (после восстановления базы или смены входа подписка иначе потерялась бы). */
async function resync(): Promise<void> {
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (sub) await register(sub);
}

export function usePush(): { state: PushState; toggle: () => Promise<void> } {
  const [state, setState] = useState<PushState>('busy');
  useEffect(() => {
    let alive = true;
    void pushState().then((s) => {
      if (!alive) return;
      setState(s);
      if (s === 'on') void resync();
    });
    return () => {
      alive = false;
    };
  }, []);
  const toggle = useCallback(async () => {
    if (state === 'busy') return;
    if (state !== 'on' && state !== 'off') return;
    setState('busy');
    setState(await (state === 'on' ? disablePush() : enablePush()));
  }, [state]);
  return { state, toggle };
}

// ---- нажатие по уведомлению при открытом приложении: сервис-воркер присылает url ----

let listening = false;
export function listenPushOpen(): void {
  if (listening || !('serviceWorker' in navigator)) return;
  listening = true;
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ type?: string; url?: string }>) => {
    if (e.data?.type !== 'zg:open' || typeof e.data.url !== 'string') return;
    let u: URL;
    try {
      u = new URL(e.data.url, location.origin);
    } catch {
      return;
    }
    if (u.origin !== location.origin) return;
    if (u.pathname !== location.pathname) {
      location.assign(u.pathname + u.search);
      return;
    }
    const tab = u.searchParams.get('tab');
    if (tab) window.dispatchEvent(new CustomEvent('zg:open-tab', { detail: tab }));
  });
}

// ---- значок на иконке установленного приложения (Badging API) ----

export function setAppBadge(n: number): void {
  const nav = navigator as { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (n > 0) void nav.setAppBadge?.(n)?.catch(() => undefined);
    else void nav.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    /* нет API — ничего */
  }
}
