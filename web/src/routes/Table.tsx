import { RoleScreen } from '../components/Shell.tsx';
import { useWakeLock } from '../lib/wakeLock.ts';

export function Table() {
  useWakeLock();
  return (
    <RoleScreen role="table" wide>
      <section className="table-stage">
        <p className="table-title">Зеленогорье</p>
        <p className="muted">Ожидание сцены</p>
      </section>
    </RoleScreen>
  );
}
