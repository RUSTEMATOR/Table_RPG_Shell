import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.ts';

/** Панель экрана. Класс `card` обязателен: по нему тема надевает свою рамку (рваные края, двойная линия…). */
export function Card({ className, as: As = 'section', ...rest }: HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' | 'aside' }) {
  return <As className={cn('card grid content-start gap-3', className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('m-0 font-name text-[1.4rem] leading-tight', className)} {...rest} />;
}
