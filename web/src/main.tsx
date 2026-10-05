import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router';
import { MeProvider } from './lib/me.tsx';
import { MotionProvider } from './lib/motion.tsx';
import { Toaster, TooltipProvider } from './ui/index.ts';
import './lib/colorScheme.ts'; // день/ночь до первой отрисовки, без мигания
import './styles/index.css';

// Экраны грузятся отдельными чанками по ролям: игрок не скачивает код мастера и стола, и наоборот.
function lazy(load: () => Promise<Record<string, unknown>>, name: string): RouteObject['lazy'] {
  return async () => ({ Component: (await load())[name] as ComponentType });
}
const gm = () => import('./routes/Gm.tsx');

const router = createBrowserRouter([
  { path: '/', lazy: lazy(() => import('./routes/Home.tsx'), 'Home') },
  { path: '/login', lazy: lazy(() => import('./routes/Login.tsx'), 'Login') },
  { path: '/join/:token', lazy: lazy(() => import('./routes/Join.tsx'), 'Join') },
  { path: '/player', lazy: lazy(() => import('./routes/Player.tsx'), 'Player') },
  {
    // Общий макет мастера (навигация, правая колонка) живёт между переходами; страницы — свои чанки.
    path: '/gm',
    lazy: lazy(() => import('./routes/GmLayout.tsx'), 'GmLayout'),
    children: [
      { index: true, lazy: lazy(gm, 'Gm') },
      { path: 'party', lazy: lazy(gm, 'GmParty') },
      { path: 'members', lazy: lazy(gm, 'GmMembers') },
      { path: 'requests', lazy: lazy(() => import('./routes/GmRequests.tsx'), 'GmRequests') },
      { path: 'notes', lazy: lazy(() => import('./routes/GmNotes.tsx'), 'GmNotes') },
      { path: 'table', lazy: lazy(() => import('./routes/GmTable.tsx'), 'GmTable') },
      { path: 'npcs', lazy: lazy(() => import('./routes/GmNpcs.tsx'), 'GmNpcs') },
      { path: 'jev', lazy: lazy(() => import('./routes/GmJev.tsx'), 'GmJev') },
      { path: 'new', lazy: lazy(() => import('./routes/GmNew.tsx'), 'GmNew') },
      { path: 'char/:id', lazy: lazy(() => import('./routes/GmCharacter.tsx'), 'GmCharacter') },
    ],
  },
  { path: '/table', lazy: lazy(() => import('./routes/Table.tsx'), 'Table') },
  ...(import.meta.env.DEV ? [{ path: '/dev/ui', lazy: lazy(() => import('./routes/DevUi.tsx'), 'DevUi') }] : []),
  { path: '*', lazy: lazy(() => import('./routes/Home.tsx'), 'Home') },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionProvider>
      <TooltipProvider>
        <MeProvider>
          <RouterProvider router={router} />
        </MeProvider>
        <Toaster />
      </TooltipProvider>
    </MotionProvider>
  </StrictMode>,
);
