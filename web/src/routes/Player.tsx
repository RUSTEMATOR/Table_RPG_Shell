import { RoleScreen } from '../components/Shell.tsx';
import { useWakeLock } from '../lib/wakeLock.ts';

export function Player() {
  useWakeLock();
  return (
    <RoleScreen role="player">
      <section className="card">
        <h2>Карточка персонажа</h2>
        <p className="muted">Появится на этапе 2.</p>
      </section>
    </RoleScreen>
  );
}
