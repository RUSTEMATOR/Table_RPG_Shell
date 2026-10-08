import { ensureFonts } from '../lib/fonts.ts';

// Шрифты карт (как в макетах): Cormorant SC — названия земель, Cormorant Garamond — места. Свои, из сборки (этап 40);
// подгружаются при первом показе карты, без них карта рисуется запасными.
export function ensureMapFonts(): void {
  void ensureFonts(['Cormorant SC', 'Cormorant Garamond']);
}
