import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';

// Движение по дизайн-системе: пружины-токены. Набор функций Motion (domMax: жесты, layout) грузится отдельным чанком.
export const spring = {
  /** индикаторы вкладок и сегментов */
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  /** листы и диалоги */
  sheet: { type: 'spring', stiffness: 380, damping: 36 },
  /** появление карточек */
  soft: { type: 'spring', stiffness: 220, damping: 26 },
} as const;

const features = () => import('motion/react').then((m) => m.domMax);

/** Корень: ленивые функции Motion и «уменьшить движение» из настройки системы. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
