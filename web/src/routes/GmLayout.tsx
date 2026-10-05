import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router';
import type { GmScene } from '@zg/shared';
import { RoleScreen } from '../components/Shell.tsx';
import { GmNav } from '../components/GmNav.tsx';
import { Feed } from '../components/Feed.tsx';
import { OpenRequestsProvider, useOpenRequests } from '../lib/openRequests.tsx';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';
import { useWakeLock } from '../lib/wakeLock.ts';
import { Button, buttonVariants, Card, CardTitle, Sheet, toast } from '../ui/index.ts';
import { cn } from '../lib/cn.ts';

/**
 * Общий макет экранов мастера. Раскладка — по ширине контейнера, а не окна:
 * от 64rem — навигация, страница, правая колонка «Сейчас в игре»; от 48rem — без колонки (она в листе из шапки);
 * уже — навигация вкладками сверху. Макет живёт между переходами: лента и подписки не пересоздаются.
 */
export function GmLayout() {
  useWakeLock();
  return (
    <OpenRequestsProvider>
      <RoleScreen role="gm" wide actions={<RailButton />}>
        <div className="@container/gm">
          <div className="grid items-start gap-5 @3xl/gm:grid-cols-[210px_minmax(0,1fr)] @5xl/gm:grid-cols-[210px_minmax(0,1fr)_minmax(300px,360px)] @7xl/gm:gap-6">
            <GmNav className="sticky top-[76px] hidden @3xl/gm:grid" />
            <GmNav variant="tabs" className="@3xl/gm:hidden" />
            <div className="flex min-w-0 flex-col gap-4">
              <Outlet />
            </div>
            <aside aria-label="Сейчас в игре" className="sticky top-[76px] hidden max-h-[calc(100dvh-92px)] flex-col gap-4 overflow-y-auto overscroll-contain @5xl/gm:flex">
              <Rail />
            </aside>
          </div>
        </div>
      </RoleScreen>
    </OpenRequestsProvider>
  );
}

/** Узко: правая колонка открывается листом. Кнопка в шапке скрыта, когда колонка и так на экране. */
function RailButton() {
  const [open, setOpen] = useState(false);
  const requests = useOpenRequests().length;
  return (
    <>
      <Button variant="ghost" size="sm" className="min-[1056px]:hidden" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Сейчас в игре{requests > 0 && <span className="rounded-full bg-accent px-1.5 font-mono text-xs leading-5 text-surface">{requests}</span>}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Сейчас в игре">
        <Rail onNavigate={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

/** Правая колонка: живая лента, открытые запросы, что на столе. */
function Rail({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <Card className="gap-2">
        <CardTitle className="text-[1.25rem]">Лента</CardTitle>
        <Feed gm limit={25} />
      </Card>
      <RailRequests onNavigate={onNavigate} />
      <OnTable onNavigate={onNavigate} />
    </>
  );
}

const time = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

function RailRequests({ onNavigate }: { onNavigate?: () => void }) {
  const open = useOpenRequests();
  return (
    <Card className="gap-2">
      <CardTitle className="text-[1.25rem]">Запросы{open.length > 0 && ` · ${open.length}`}</CardTitle>
      {open.length === 0 && <p className="m-0 text-muted">Открытых вопросов нет.</p>}
      <ul className="m-0 grid list-none gap-3 p-0">
        {open.slice(0, 4).map((e) => (
          <li key={e.id} className="grid gap-1 border-b border-solid border-border pb-3 last:border-0 last:pb-0">
            <span className="font-ui text-xs font-medium uppercase tracking-[.06em] text-muted">
              {e.characterName ?? e.memberName} · {time(e.createdAt)}
            </span>
            <p className="m-0 line-clamp-3">{e.text}</p>
          </li>
        ))}
      </ul>
      {open.length > 0 && (
        <Link to="/gm/requests" viewTransition onClick={onNavigate} className="font-ui text-sm font-semibold text-link">
          Ответить в «Запросах» →
        </Link>
      )}
    </Card>
  );
}

function OnTable({ onNavigate }: { onNavigate?: () => void }) {
  const [shown, setShown] = useState<GmScene | null | undefined>(undefined);
  const load = useCallback(async () => {
    const r = await api<GmScene[]>('GET', '/api/gm/scenes');
    if (r.ok) setShown(r.data.find((s) => s.shown) ?? null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('gm:scenes.changed', () => void load());
  const hide = async () => {
    const r = await api('POST', '/api/gm/table/show', { sceneId: null });
    if (r.ok) {
      setShown(null);
      toast('Сцена убрана со стола');
    }
  };
  return (
    <Card className="gap-2">
      <CardTitle className="text-[1.25rem]">На столе</CardTitle>
      {shown === undefined ? null : shown ? (
        <div
          className="flex h-[120px] items-end rounded-control bg-[linear-gradient(160deg,#3d4a3f,#1a201b)] bg-cover bg-center px-3 py-2.5 font-name text-[1.35rem] leading-tight text-[#f5f7f2] [text-shadow:0_1px_3px_rgba(0,0,0,.6)]"
          style={shown.image ? { backgroundImage: `linear-gradient(to top, rgba(0,0,0,.6), transparent 60%), url(${shown.image.url})` } : undefined}
        >
          {shown.title}
        </div>
      ) : (
        <p className="m-0 text-muted">Стол пуст: показывается заставка.</p>
      )}
      <div className="flex gap-2">
        <Link to="/gm/table" viewTransition onClick={onNavigate} className={cn(buttonVariants(), 'grow no-underline')}>
          {shown ? 'Сменить сцену' : 'Выбрать сцену'}
        </Link>
        {shown && (
          <Button variant="ghost" onClick={hide}>
            Убрать
          </Button>
        )}
      </div>
    </Card>
  );
}
