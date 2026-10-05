// Вибрация телефона. На iPhone браузерной вибрации нет — функции просто ничего не делают.

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export const haptics = {
  /** нажатие кнопки */
  tap: () => vibrate(10),
  /** удар кубика о лоток */
  bump: (strength = 1) => vibrate(Math.round(6 + strength * 14)),
  /** результат броска */
  success: () => vibrate([18, 40, 18]),
  crit: () => vibrate([20, 50, 20, 50, 60]),
  fail: () => vibrate([60]),
};
