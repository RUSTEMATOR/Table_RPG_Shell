import { useSyncExternalStore } from 'react';
import type { DiaryEntryPlayer, PlayerCharacter } from '@zg/shared';
import { load, save } from './storage.ts';

// Значки непрочитанного на вкладках игрока. Только из того, что игроку и так приходит; сервер ничего не знает.
// Отметки хранятся на устройстве, чтобы значок пережил перезагрузку.

export type UnreadTab = 'card' | 'diary';

const KEY = 'zg:unread';
const REPLIES = 'zg:unread:replies';
const CARD = 'zg:unread:card';

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(load(key) ?? '') as T) ?? fallback;
  } catch {
    return fallback;
  }
}

let flags: Record<UnreadTab, boolean> = { card: false, diary: false, ...read<Partial<Record<UnreadTab, boolean>>>(KEY, {}) };
let active: UnreadTab | 'rolls' | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  save(KEY, JSON.stringify(flags));
  listeners.forEach((l) => l());
};

function mark(tab: UnreadTab) {
  if (active === tab || flags[tab]) return;
  flags = { ...flags, [tab]: true };
  emit();
}

/** Открыта вкладка: снять её значок. */
export function setActiveTab(tab: UnreadTab | 'rolls' | null) {
  active = tab;
  if (tab && tab !== 'rolls' && flags[tab]) {
    flags = { ...flags, [tab]: false };
    emit();
  }
}

export function useUnread(): Record<UnreadTab, boolean> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => flags,
  );
}

// ---- Дневник: значок, когда у записи появился или изменился ответ мастера ----

let replies: Record<string, string> = read(REPLIES, {});

/** Запомнить ответы, которые игрок уже видел (вкладка дневника загрузила записи). */
export function rememberReplies(entries: DiaryEntryPlayer[]) {
  let changed = false;
  for (const e of entries) {
    if ((e.reply ?? '') !== (replies[e.id] ?? '')) {
      replies = { ...replies, [e.id]: e.reply ?? '' };
      changed = true;
    }
  }
  if (changed) save(REPLIES, JSON.stringify(replies));
}

export function noteDiaryChange(entry: DiaryEntryPlayer) {
  const reply = entry.reply ?? '';
  if (reply && reply !== (replies[entry.id] ?? '')) {
    mark('diary');
    if (active === 'diary') rememberReplies([entry]);
  }
}

// ---- Карточка: значок, когда видимая карточка действительно изменилась ----

/** Короткий отпечаток карточки (djb2): хранить её целиком на устройстве незачем. */
function fingerprint(c: PlayerCharacter | null): string {
  const s = JSON.stringify(c);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
}

let cardSeen: string | null = load(CARD);

export function rememberCard(c: PlayerCharacter | null) {
  cardSeen = fingerprint(c);
  save(CARD, cardSeen);
}

export function noteCardChange(c: PlayerCharacter | null) {
  const f = fingerprint(c);
  if (f === cardSeen) return;
  if (active === 'card') rememberCard(c);
  else mark('card');
}
