import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ru, type Role } from '@zg/shared';
import { api } from '../lib/api.ts';
import { homeFor, useMe } from '../lib/me.tsx';
import { connectSocket, disconnectSocket, useConnection } from '../lib/socket.ts';
import { ConnectionDot } from './ConnectionDot.tsx';
import { useSkin } from '../lib/cardTheme/skin.ts';

/** Экран для одной роли: без нужной роли — на вход, данные не запрашиваются. */
export function RoleScreen({ role, children, wide }: { role: Role; children: ReactNode; wide?: boolean }) {
  const { me, loading, refresh } = useMe();
  const navigate = useNavigate();
  const conn = useConnection();
  const allowed = me?.member.role === role;
  // Мастер — в оформлении «Зеленогорье» артефакта; тему игрока ставит экран игрока (по его персонажу), стол не оформляется.
  useSkin(role === 'gm' && allowed ? 'other' : undefined);

  useEffect(() => {
    if (loading) return;
    if (!me) navigate('/login', { replace: true });
    else if (!allowed) navigate(homeFor(me.member.role), { replace: true });
  }, [loading, me, allowed, navigate]);

  useEffect(() => {
    if (!allowed) return;
    connectSocket();
  }, [allowed]);

  useEffect(() => {
    if (conn === 'unauthorized') void refresh();
  }, [conn, refresh]);

  if (!allowed || !me) return <div className="screen center muted">Загрузка…</div>;

  const logout = async () => {
    await api('POST', '/api/auth/logout');
    disconnectSocket();
    await refresh();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`screen ${wide ? 'screen-wide' : ''}`}>
      <header className="topbar">
        <div className="topbar-title">
          <strong>{me.room.name}</strong>
          <span className="muted">
            {ru.roles[me.member.role]} · {me.member.name}
          </span>
        </div>
        <ConnectionDot />
        {role !== 'table' && (
          <button className="btn btn-ghost" onClick={logout}>
            Выйти
          </button>
        )}
      </header>
      <main>{children}</main>
    </div>
  );
}
