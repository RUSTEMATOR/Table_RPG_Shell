import { ru } from '@zg/shared';
import { useConnection } from '../lib/socket.ts';

const LABEL = {
  online: ru.connection.online,
  connecting: ru.connection.connecting,
  offline: ru.connection.offline,
  unauthorized: ru.errors.unauthorized,
} as const;

export function ConnectionDot() {
  const state = useConnection();
  return (
    <span className={`conn conn-${state}`} role="status" aria-live="polite">
      <span className="conn-dot" aria-hidden="true" />
      <span className="conn-label">{LABEL[state]}</span>
    </span>
  );
}
