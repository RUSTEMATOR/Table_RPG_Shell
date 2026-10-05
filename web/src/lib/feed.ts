import { useSyncExternalStore } from 'react';
import type { AudienceKey, FeedEvent, RollGm, RollPublic, SyncWelcome } from '@zg/shared';

// Лента бросков на клиенте. lastSeq — по каждой своей аудитории; пропуск номера означает,
// что мы что-то не получили, и нужна досинхронизация.

export type FeedRoll = RollPublic | RollGm;
export const isGmRoll = (r: FeedRoll): r is RollGm => 'memberId' in r;

const rolls = new Map<string, FeedRoll>();
let lastSeq: Partial<Record<AudienceKey, number>> = {};
let snapshot: FeedRoll[] = [];
const listeners = new Set<() => void>();
const live = new Set<(r: FeedRoll) => void>();

/** Подписка на броски, пришедшие вживую (не досинхронизация после переподключения). Для 3D на столе и у мастера. */
export function onLiveRoll(cb: (r: FeedRoll) => void): () => void {
  live.add(cb);
  return () => live.delete(cb);
}

// Свой бросок не показывается в ленте, пока кубик не лёг: событие ленты приходит раньше посадки.
// Придерживаются только новые броски того, кто бросает с этого устройства, тем же кубиком.
let hold: { who: string; kind: string } | null = null;
const held = new Set<string>();

/** Придержать свой следующий бросок в ленте. Вернёт «отпустить»; сам отпускается через 4 с. */
export function holdOwn(who: string, kind: string): () => void {
  const h = { who, kind };
  hold = h;
  const release = () => {
    window.clearTimeout(timer);
    if (hold !== h) return;
    hold = null;
    if (held.size) {
      held.clear();
      emit();
    }
  };
  const timer = window.setTimeout(release, 4000);
  return release;
}

function emit() {
  snapshot = [...rolls.values()]
    .filter((r) => !held.has(r.id))
    .sort((a, b) => b.at - a.at)
    .slice(0, 200);
  listeners.forEach((l) => l());
}

function upsert(r: FeedRoll) {
  const prev = rolls.get(r.id);
  // У мастера одна и та же запись приходит и публичной, и полной: полная важнее.
  if (prev && isGmRoll(prev) && !isGmRoll(r)) return;
  rolls.set(r.id, r);
}

export function feedLastSeq() {
  return { ...lastSeq };
}

/** Живое событие. Возвращает 'gap', если пропущен номер и нужна досинхронизация. */
export function ingest(ev: FeedEvent): 'ok' | 'gap' | 'dup' {
  const last = lastSeq[ev.aud] ?? 0;
  if (ev.seq <= last) return 'dup';
  if (ev.seq > last + 1) return 'gap';
  const fresh = !rolls.has(ev.roll.id);
  if (fresh && hold && ev.roll.who === hold.who && ev.roll.kind === hold.kind) held.add(ev.roll.id);
  upsert(ev.roll);
  lastSeq[ev.aud] = ev.seq;
  emit();
  if (fresh) live.forEach((cb) => cb(ev.roll));
  return 'ok';
}

export function applyWelcome(w: SyncWelcome) {
  if (w.reset) {
    rolls.clear();
    lastSeq = {};
  }
  for (const ev of w.events) {
    upsert(ev.roll);
    lastSeq[ev.aud] = Math.max(lastSeq[ev.aud] ?? 0, ev.seq);
  }
  emit();
}

export function clearFeed() {
  rolls.clear();
  lastSeq = {};
  emit();
}

// Свои броски с этого устройства: для фильтра «Мои» (броски с других устройств узнаются по имени).
const own = new Set<string>();
export const isOwnRoll = (id: string) => own.has(id);

/** Ответ на свой бросок приходит раньше события ленты — показываем сразу. */
export function addOwn(r: FeedRoll) {
  own.add(r.id);
  held.delete(r.id);
  upsert(r);
  emit();
}

export function useFeed(): FeedRoll[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}
