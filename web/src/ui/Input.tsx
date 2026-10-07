import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn.ts';

// 16 px при пальце: мельче Safari увеличивает страницу при фокусе на поле. С мышью — 15 px.
const field =
  'w-full min-h-11 rounded-control border border-solid border-border bg-surface-2 px-3 py-2.5 font-ui text-base pointer-fine:text-[15px] leading-[22px] text-text placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-accent aria-invalid:border-danger disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(field, 'resize-y', className)} {...rest} />;
});
