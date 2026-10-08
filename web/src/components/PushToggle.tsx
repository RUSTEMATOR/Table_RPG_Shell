import { useEffect } from 'react';
import { listenPushOpen, usePush } from '../lib/push.ts';
import { toast } from '../ui/index.ts';

const BELL = 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0';
const BELL_OFF = 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0M4 4l16 16';

/** Колокольчик в шапке (этап 41): включить или выключить push-уведомления на этом устройстве. */
export function PushToggle() {
  const { state, toggle } = usePush();
  useEffect(() => listenPushOpen(), []);
  if (state === 'unsupported' || state === 'disabled') return null;
  const on = state === 'on';
  const title =
    state === 'need-install'
      ? 'Уведомления: добавьте приложение на экран «Домой»'
      : state === 'denied'
        ? 'Уведомления запрещены в настройках браузера'
        : on
          ? 'Уведомления включены (нажать, чтобы выключить)'
          : 'Уведомления выключены (нажать, чтобы включить)';
  const click = () => {
    if (state === 'need-install') toast('Добавьте приложение на экран «Домой» (Поделиться → На экран «Домой»), тогда уведомления заработают');
    else if (state === 'denied') toast('Уведомления запрещены в настройках браузера для этого сайта');
    else void toggle();
  };
  return (
    <button type="button" className="btn btn-ghost push-toggle" onClick={click} title={title} aria-label={title} aria-pressed={on} disabled={state === 'busy'}>
      <svg viewBox="0 0 24 24" aria-hidden="true" style={{ opacity: on || state === 'busy' ? 1 : 0.6 }}>
        <path d={on ? BELL : BELL_OFF} />
      </svg>
    </button>
  );
}
