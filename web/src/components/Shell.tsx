import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ru, type Role } from '@zg/shared';
import { api } from '../lib/api.ts';
import { homeFor, useMe } from '../lib/me.tsx';
import { connectSocket, disconnectSocket, useConnection } from '../lib/socket.ts';
import { ConnectionDot } from './ConnectionDot.tsx';
import { useSkin } from '../lib/cardTheme/skin.ts';
import { SchemeToggle } from './SchemeToggle.tsx';
import { cn } from '../lib/cn.ts';
import { Button, Dialog, DialogClose, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/index.ts';

/**
 * Экран для одной роли: без нужной роли — на вход, данные не запрашиваются.
 * fill — экран ровно в высоту окна (телефон игрока): прокручиваются вкладки внутри, панель вкладок внизу.
 */
export function RoleScreen({ role, children, wide, fill, actions }: { role: Role; children: ReactNode; wide?: boolean; fill?: boolean; actions?: ReactNode }) {
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
    <div className={cn('screen', wide && 'screen-wide', fill && 'screen-fill flex h-dvh flex-col overflow-hidden pb-0')}>
      <header className="topbar">
        <div className="topbar-title">
          <strong>{me.room.name}</strong>
          <span className="muted">
            {ru.roles[me.member.role]} · {me.member.name}
          </span>
        </div>
        {actions}
        <ConnectionDot />
        {role !== 'table' && <SchemeToggle />}
        {role !== 'table' && <MoreMenu role={role} onLogout={logout} />}
      </header>
      <main className={cn(fill && 'min-h-0 flex-1 gap-0')}>{children}</main>
    </div>
  );
}

/** «⋯» в шапке: «Выйти…» с подтверждением — случайное нажатие на телефоне не выкидывает на вход посреди сессии. */
function MoreMenu({ role, onLogout }: { role: Role; onLogout: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      {/* modal={false}: меню закрывается до открытия диалога, иначе Radix оставляет странице pointer-events: none */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="btn btn-ghost more-menu" aria-label="Ещё">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h.01M12 12h.01M19 12h.01" />
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem danger onSelect={() => setConfirm(true)}>
            Выйти…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title="Выйти?" description={`Чтобы вернуться, понадобится ${role === 'gm' ? 'пароль' : 'PIN'}.`}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Отмена</Button>
            </DialogClose>
            <Button variant="danger" onClick={onLogout}>
              Выйти
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
