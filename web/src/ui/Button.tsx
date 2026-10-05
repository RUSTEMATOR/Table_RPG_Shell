import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

// Кнопка по дизайн-системе: одна primary на экран, высота от 44px, сжатие при нажатии, кольцо фокуса accent.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 rounded-control border border-solid font-ui text-[15px] font-semibold leading-5 cursor-pointer select-none transition-[transform,background-color,border-color,color] duration-[120ms] active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100',
  {
    variants: {
      variant: {
        default: 'bg-surface text-text border-border hover:bg-surface-2',
        primary: 'bg-primary text-on-primary border-primary hover:opacity-90',
        ghost: 'bg-transparent text-text border-transparent hover:bg-surface-2',
        danger: 'bg-transparent text-danger border-danger hover:bg-danger-soft',
        confirm: 'bg-danger text-surface border-danger',
      },
      size: {
        md: '',
        sm: 'min-h-9 px-3 py-1.5 text-sm',
        lg: 'min-h-13 px-5 text-base',
        icon: 'size-11 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, type = 'button', ...rest }, ref) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...rest} />;
});
