// Шрифты карт (как в макетах): Cormorant SC — названия земель, Cormorant Garamond — места. Подгружаются при первом показе карты.
let requested = false;
export function ensureMapFonts(): void {
  if (requested) return;
  requested = true;
  try {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Cormorant+SC:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,600;0,700;1,500;1,600&display=swap';
    document.head.appendChild(l);
  } catch {
    /* без шрифтов карта рисуется запасными */
  }
}
