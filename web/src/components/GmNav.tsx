import { NavLink } from 'react-router';

const ITEMS = [
  ['/gm', 'Игра'],
  ['/gm/party', 'Партия'],
  ['/gm/table', 'Стол'],
  ['/gm/requests', 'Запросы'],
  ['/gm/notes', 'Заметки'],
  ['/gm/members', 'Участники'],
] as const;

export function GmNav() {
  return (
    <nav className="gm-nav" aria-label="Разделы мастера">
      {ITEMS.map(([to, label]) => (
        <NavLink key={to} to={to} end className={({ isActive }) => `tab ${isActive ? 'tab-on' : ''}`}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
