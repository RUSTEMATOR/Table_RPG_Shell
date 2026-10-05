import { NavLink } from 'react-router';
import { useOpenRequests } from '../lib/openRequests.ts';

const ITEMS = [
  ['/gm', 'Игра'],
  ['/gm/party', 'Партия'],
  ['/gm/npcs', 'Противники'],
  ['/gm/table', 'Стол'],
  ['/gm/requests', 'Запросы'],
  ['/gm/notes', 'Заметки'],
  ['/gm/members', 'Участники'],
] as const;

export function GmNav() {
  const open = useOpenRequests();
  return (
    <nav className="gm-nav" aria-label="Разделы мастера">
      {ITEMS.map(([to, label]) => (
        <NavLink key={to} to={to} end className={({ isActive }) => `tab ${isActive ? 'tab-on' : ''}`}>
          {label}
          {to === '/gm/requests' && open > 0 && <span className="nav-count"> · {open}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
