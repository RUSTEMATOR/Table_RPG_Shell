import { useEffect, useRef, useState } from 'react';
import { appendPhrase, dictationSupported, startDictation, type Dictation } from '../lib/dictation.ts';
import { cn } from '../lib/cn.ts';

const ERRORS: Record<string, string> = {
  'not-allowed': 'Нет доступа к микрофону — разреши его в настройках браузера.',
  'service-not-allowed': 'Браузер не разрешает распознавание речи.',
  network: 'Распознаванию нужна сеть.',
  'no-speech': 'Ничего не слышно.',
  'audio-capture': 'Микрофон не найден.',
};

/**
 * Кнопка микрофона (этап 56): диктовка дописывает текст в поле через onChange. Пока идёт — пульсирует, под ней
 * промежуточный текст. Где браузер не умеет — кнопки нет.
 */
export function DictateButton({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [on, setOn] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Dictation | null>(null);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => () => rec.current?.stop(), []);
  if (!dictationSupported()) return null;
  const toggle = () => {
    if (on) return rec.current?.stop();
    setError(null);
    rec.current = startDictation({
      onFinal: (t) => {
        const next = appendPhrase(latest.current, t);
        latest.current = next;
        onChange(next);
      },
      onInterim: setInterim,
      onEnd: () => {
        setOn(false);
        setInterim('');
        rec.current = null;
      },
      onError: (code) => setError(ERRORS[code] ?? 'Диктовка не удалась.'),
    });
    setOn(rec.current !== null);
  };
  return (
    <div className={cn('grid gap-1', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        title="Диктовка: распознаёт браузер (Google или Apple)"
        className={cn(
          'inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-solid px-3 py-1 font-ui text-[13px] transition-colors',
          on ? 'animate-pulse border-danger bg-danger-soft text-danger' : 'border-border bg-transparent text-muted hover:text-text',
        )}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2 [stroke-linecap:round]">
          <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        {on ? 'Стоп' : 'Диктовать'}
      </button>
      {on && interim && <span className="text-[13px] text-muted italic">{interim}</span>}
      {error && <span className="text-[13px] text-danger">{error}</span>}
    </div>
  );
}
