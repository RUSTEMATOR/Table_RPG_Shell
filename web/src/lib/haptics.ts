// Вибрация телефона. На iPhone браузерной вибрации нет — там короткий отклик через переключатель Safari 18 (iosTick).

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
    else iosPattern(pattern);
  } catch {
    /* ignore */
  }
}

/**
 * Safari 18 на iPhone даёт системный отклик при переключении <input type="checkbox" switch>, в том числе по label.click().
 * Надёжно — во время жеста пользователя; позже (удар и посадка кубика) iOS может промолчать. Старый iOS и компьютер — тихо ничего.
 */
let label: HTMLLabelElement | null = null;
function iosTick(): void {
  if (typeof document === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;
  if (!label) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);opacity:0;pointer-events:none';
    label.append(input);
    document.body.append(label);
  }
  label.click();
}

/** Узор вибрации (вибрация, пауза, вибрация…) — касание в начале каждой вибрации. */
function iosPattern(pattern: number | number[]): void {
  const steps = typeof pattern === 'number' ? [pattern] : pattern;
  let at = 0;
  steps.forEach((ms, i) => {
    if (i % 2 === 0) {
      if (at === 0) iosTick();
      else window.setTimeout(iosTick, at);
    }
    at += ms;
  });
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
