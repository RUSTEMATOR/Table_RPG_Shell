import { useEffect, useState } from 'react';

// Высота экранной клавиатуры. На iOS клавиатура не уменьшает окно, а закрывает его низ: лист снизу
// поднимаем на эту высоту. На Android с interactive-widget=resizes-content окно уменьшается само, здесь будет 0.

function inset(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

/** Сколько пикселей снизу закрывает клавиатура (0 без неё). Слушает, только пока active. */
export function useKeyboardInset(active = true): number {
  const [px, setPx] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return setPx(0);
    const update = () => setPx(inset());
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return px;
}
