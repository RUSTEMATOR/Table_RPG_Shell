import { useEffect, useState } from 'react';

/** Телефонная раскладка: палец вместо мыши или узкое окно (в т. ч. телефон в альбомной ориентации — по высоте). */
export const PHONE_QUERY = '(pointer: coarse), (max-width: 760px), (max-height: 520px)';
/** Компьютер: широкое окно и мышь — разворот у игрока, панель справа вместо листа снизу. */
export const DESKTOP_QUERY = '(min-width: 1100px) and (pointer: fine)';

/** Совпадает ли медиазапрос; следит за изменением (поворот, размер окна, другой экран). */
export function useMedia(q: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const upd = () => setOn(m.matches);
    upd();
    m.addEventListener('change', upd);
    return () => m.removeEventListener('change', upd);
  }, [q]);
  return on;
}
