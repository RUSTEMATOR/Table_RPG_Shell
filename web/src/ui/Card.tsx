import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.ts';

/** Панель экрана. Класс `card` обязателен: по нему тема надевает свою рамку (рваные края, двойная линия…). */
export function Card({ className, as: As = 'section', children, ...rest }: HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' | 'aside' }) {
  return (
    <As className={cn('card grid content-start gap-3', className)} {...rest}>
      {/* углы набора украшений темы (этап 36): видны, только когда у темы есть угол — app-skin.css */}
      <i aria-hidden="true" className="card-deco" />
      {children}
    </As>
  );
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('card-title m-0 font-name text-[1.4rem] leading-tight', className)} {...rest} />;
}
