// Что умеет устройство. Решает, показывать ли 3D-кубики, частицы и переходы, или простой вид.

function media(q: string): boolean {
  try {
    return matchMedia(q).matches;
  } catch {
    return false;
  }
}

let webgl2: boolean | null = null;
function hasWebgl2(): boolean {
  if (webgl2 !== null) return webgl2;
  try {
    const c = document.createElement('canvas');
    webgl2 = !!c.getContext('webgl2');
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

export const capabilities = {
  /** «Уменьшить движение» в системе. */
  reducedMotion: () => media('(prefers-reduced-motion: reduce)'),
  /** Можно ли показать 3D. */
  webgl2: hasWebgl2,
  /** Плавные переходы между экранами. */
  viewTransitions: () => typeof document !== 'undefined' && 'startViewTransition' in document,
  /** Устройство с пальцем, а не мышью. */
  touch: () => media('(pointer: coarse)'),
  /** Облегчённый режим: ?lite=1, слабое устройство или нет WebGL2. На столе включается сам. */
  lite: () => {
    try {
      if (new URLSearchParams(location.search).get('lite') === '1') return true;
    } catch {
      /* ignore */
    }
    const cores = navigator.hardwareConcurrency ?? 4;
    return cores <= 2 || !hasWebgl2();
  },
};

/** Полные эффекты (3D, частицы): есть WebGL2, нет «уменьшить движение», не облегчённый режим. */
export function fullEffects(): boolean {
  return !capabilities.reducedMotion() && !capabilities.lite();
}
