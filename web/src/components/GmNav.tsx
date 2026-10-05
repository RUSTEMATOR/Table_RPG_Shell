import { NavLink } from 'react-router';
import { useOpenRequests } from '../lib/openRequests.tsx';
import { cn } from '../lib/cn.ts';

/** Разделы мастера: путь, подпись, значок (как в макете), буква для «G + буква». */
export const GM_SECTIONS = [
  { to: '/gm', label: 'Игра', key: 'i', icon: 'M12 6a6 6 0 1 0 0 12a6 6 0 0 0 0-12zM12 2v6M12 16v6M2 12h6M16 12h6' },
  {
    to: '/gm/party',
    label: 'Партия',
    key: 'p',
    icon: 'M8 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM3 20c0-3 2.2-5 5-5s5 2 5 5M16.5 10a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5zM15 14.3c.5-.2 1-.3 1.5-.3c2.5 0 4.5 1.8 4.5 4.5',
  },
  { to: '/gm/npcs', label: 'Противники', key: 'o', icon: 'M4 18h16M4 18L3 8l5 4 4-7 4 7 5-4-1 10' },
  { to: '/gm/table', label: 'Стол', key: 't', icon: 'M6 21V8l2-2V3h2v2h4V3h2v3l2 2v13zM10 21v-5h4v5' },
  { to: '/gm/requests', label: 'Запросы', key: 'r', icon: 'M6 3h9l3 3v15H6zM15 3v3h3M9 10h6M9 14h6M9 18h4' },
  { to: '/gm/notes', label: 'Заметки', key: 'n', icon: 'M20 3c-6 1-11 5-13 11l-2 6 6-2c6-2 10-7 11-13zM7 17l6-6M5 21h6' },
  { to: '/gm/members', label: 'Участники', key: 'u', icon: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM13 7l-3 5h4l-3 5' },
] as const;

export function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-5 shrink-0 fill-none stroke-current stroke-[1.7] [stroke-linecap:round] [stroke-linejoin:round]', className)}>
      <path d={d} />
    </svg>
  );
}

/**
 * Навигация мастера. Широко — колонка слева со значками; узко (variant="tabs") — вкладки сверху с прокруткой.
 * Число у «Запросов» — открытые вопросы игроков.
 */
export function GmNav({ variant = 'side', className }: { variant?: 'side' | 'tabs'; className?: string }) {
  const open = useOpenRequests().length;
  const side = variant === 'side';
  return (
    <nav
      aria-label="Разделы мастера"
      className={cn(side ? 'grid content-start gap-0.5' : 'flex gap-1 overflow-x-auto border-b border-solid border-border pb-1 [scrollbar-width:none]', className)}
    >
      {GM_SECTIONS.map((s) => (
        <NavLink
          key={s.to}
          to={s.to}
          end
          viewTransition
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-control font-ui text-[15px] font-medium no-underline transition-colors focus-visible:outline-2 focus-visible:outline-accent',
              side ? 'min-h-10 px-3' : 'min-h-10 shrink-0 px-3 whitespace-nowrap',
              isActive ? 'bg-accent-soft text-accent' : 'text-text hover:bg-surface-2',
            )
          }
        >
          {side && <Icon d={s.icon} />}
          <span className="grow">{s.label}</span>
          {s.to === '/gm/requests' && open > 0 && (
            <span className="min-w-6 rounded-full bg-accent px-1.5 text-center font-mono text-xs leading-5 text-surface" aria-label={`открытых: ${open}`}>
              {open}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
