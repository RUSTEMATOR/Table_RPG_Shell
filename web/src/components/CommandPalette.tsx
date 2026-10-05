import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Command } from 'cmdk';
import { Dialog as D } from 'radix-ui';
import { EFFECT_LABELS, type GmCharacterListItem, type GmNpc, type GmScene, type HintCheck } from '@zg/shared';
import { api } from '../lib/api.ts';
import { requestRoll } from '../lib/socket.ts';
import { addOwn } from '../lib/feed.ts';
import { MOD } from '../lib/hotkeys.ts';
import { GM_SECTIONS, Icon } from './GmNav.tsx';
import { toast } from '../ui/index.ts';
import { overlayClass } from '../ui/Dialog.tsx';

type Data = { scenes: GmScene[]; npcs: GmNpc[]; chars: GmCharacterListItem[] };

function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Палитра команд мастера (⌘K / Ctrl+K): разделы, сцены и противники на стол, противник сессии, персонажи, броски.
 * Данные читаются при каждом открытии. Сцена с текстом для стола проходит ту же проверку стражем Jev, что и на «Столе»:
 * если страж сомневается или недоступен — открывается «Стол», без показа.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!open) return;
    setSearch('');
    let alive = true;
    void Promise.all([api<GmScene[]>('GET', '/api/gm/scenes'), api<GmNpc[]>('GET', '/api/gm/npcs'), api<GmCharacterListItem[]>('GET', '/api/gm/characters')]).then(([s, n, c]) => {
      if (alive) setData({ scenes: s.ok ? s.data : [], npcs: n.ok ? n.data : [], chars: c.ok ? c.data : [] });
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const run = (fn: () => unknown) => () => {
    onOpenChange(false);
    void fn();
  };
  const go = (to: string) => run(() => navigate(to, { viewTransition: true }));

  const showScene = async (s: GmScene) => {
    if (s.textPublic.trim()) {
      const c = await api<Pick<HintCheck, 'status' | 'others'>>('POST', '/api/gm/scenes/check', { text: s.textPublic });
      const status = c.ok ? c.data.status : 'unavailable';
      if (status === 'warn' || status === 'unavailable') {
        toast(status === 'warn' ? 'Страж Jev сомневается в тексте сцены — проверьте на «Столе»' : 'Страж Jev недоступен — покажите сцену со «Стола»');
        return navigate('/gm/table', { viewTransition: true });
      }
    }
    const r = await api('POST', '/api/gm/table/show', { sceneId: s.id });
    if (r.ok) toast(`«${s.title}» на столе`);
    else toast.error('Сцена не показалась');
  };
  const post = async (path: string, body: unknown, ok: string) => {
    const r = await api('POST', path, body);
    if (r.ok) toast(ok);
    else toast.error('Не получилось');
  };
  const roll = async (kind: 'd10' | 'd20', visibility: 'public' | 'gm_hidden') => {
    const res = await requestRoll({ clientRequestId: newRequestId(), kind, visibility, label: '' });
    if (!res.ok) return toast.error(res.error === 'timeout' ? 'Нет ответа от сервера' : 'Бросок не удался');
    addOwn(res.roll);
    toast(`${kind}${visibility === 'gm_hidden' ? ' скрытно' : ''}: ${res.roll.value} — ${EFFECT_LABELS[res.roll.effect]}`);
  };

  const shownScene = data?.scenes.some((s) => s.shown);
  const shownNpc = data?.npcs.some((n) => n.shown);
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlayClass} />
        <D.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-sheet border border-solid border-border bg-surface text-text shadow-[0_24px_64px_rgba(20,26,21,.28)] transition-[opacity,scale] duration-150 starting:scale-[.97] starting:opacity-0 focus:outline-none motion-reduce:transition-none"
        >
          <D.Title className="sr-only">Команды</D.Title>
          <Command label="Команды" loop className="grid">
            <div className="flex items-center gap-3 border-b border-solid border-border px-[18px] py-3.5">
              <Icon d="M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM21 21l-5-5" className="text-muted" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Команда или поиск"
                className="min-w-0 grow border-0 bg-transparent font-ui text-lg text-text outline-0 placeholder:text-faint"
              />
              <kbd className="rounded border border-solid border-border px-1.5 font-mono text-xs text-muted">Esc</kbd>
            </div>
            <Command.List className="max-h-[min(60vh,480px)] overflow-y-auto overscroll-contain p-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-ui [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-[.06em] [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:uppercase">
              <Command.Empty className="px-3 py-6 text-center text-muted">Ничего не нашлось.</Command.Empty>
              {!data && <Command.Loading className="px-3 py-2 text-muted">Загружаю сцены и персонажей…</Command.Loading>}

              <Command.Group heading="Стол">
                {data?.scenes.map((s) => (
                  <Item key={s.id} value={`показать сцену ${s.title} ${s.id}`} onSelect={run(() => showScene(s))} hint={s.shown ? 'сейчас на столе' : undefined}>
                    Показать сцену «{s.title}»
                  </Item>
                ))}
                {shownScene && (
                  <Item value="убрать сцену со стола" onSelect={run(() => post('/api/gm/table/show', { sceneId: null }, 'Сцена убрана со стола'))}>
                    Убрать сцену со стола
                  </Item>
                )}
                {data?.npcs.map((n) => (
                  <Item
                    key={n.id}
                    value={`показать портрет ${n.name} ${n.id}`}
                    onSelect={run(() => post('/api/gm/table/npc', { npcId: n.id }, `«${n.name}» на столе`))}
                    hint={n.shown ? 'сейчас на столе' : undefined}
                  >
                    Показать портрет: {n.name}
                  </Item>
                ))}
                {shownNpc && (
                  <Item value="убрать портрет со стола" onSelect={run(() => post('/api/gm/table/npc', { npcId: null }, 'Противник убран со стола'))}>
                    Убрать портрет со стола
                  </Item>
                )}
              </Command.Group>

              {!!data?.npcs.length && (
                <Command.Group heading="Противник сессии">
                  {data.npcs.map((n) => (
                    <Item
                      key={n.id}
                      value={`противник сессии ${n.name} ${n.id}`}
                      onSelect={run(() => post('/api/gm/session/opponent', { name: '', power: null, npcId: n.id }, `«${n.name}» — противник сессии`))}
                      hint={n.band || undefined}
                    >
                      {n.name} — в сессию
                    </Item>
                  ))}
                </Command.Group>
              )}

              {!!data?.chars.length && (
                <Command.Group heading="Персонажи">
                  {data.chars.map((c) => (
                    <Item
                      key={c.id}
                      value={`персонаж ${c.name} ${c.ownerName ?? ''} ${c.id}`}
                      onSelect={go(`/gm/char/${c.id}`)}
                      hint={c.ownerName ?? (c.kind === 'local' ? 'местный' : 'без игрока')}
                    >
                      {c.name} — открыть
                    </Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Броски">
                <Item value="бросок d10 всем" onSelect={run(() => roll('d10', 'public'))}>
                  Бросок d10 всем
                </Item>
                <Item value="бросок d20 всем" onSelect={run(() => roll('d20', 'public'))}>
                  Бросок d20 всем
                </Item>
                <Item value="бросок d10 скрытно скрытый" onSelect={run(() => roll('d10', 'gm_hidden'))}>
                  Бросок d10 скрытно
                </Item>
                <Item value="бросок d20 скрытно скрытый" onSelect={run(() => roll('d20', 'gm_hidden'))}>
                  Бросок d20 скрытно
                </Item>
              </Command.Group>

              <Command.Group heading="Разделы">
                {GM_SECTIONS.map((s) => (
                  <Item key={s.to} value={`раздел ${s.label}`} onSelect={go(s.to)} hint={`G ${s.key.toUpperCase()}`}>
                    {s.label}
                  </Item>
                ))}
                <Item value="новый персонаж" onSelect={go('/gm/new')}>
                  Новый персонаж
                </Item>
                <Item value="песочница jev" onSelect={go('/gm/jev')}>
                  Песочница Jev
                </Item>
              </Command.Group>
            </Command.List>
            <div className="flex gap-4 border-t border-solid border-border px-[18px] py-2.5 font-ui text-[12.5px] text-muted">
              <span>↑↓ выбрать</span>
              <span>↵ выполнить</span>
              <span>{MOD}K закрыть</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Item({ value, onSelect, hint, children }: { value: string; onSelect: () => void; hint?: string; children: ReactNode }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-control px-3 py-2 font-ui text-[15px] text-text data-[selected=true]:bg-accent-soft"
    >
      <span className="min-w-0 grow truncate">{children}</span>
      {hint && <span className="shrink-0 text-[13px] text-muted">{hint}</span>}
    </Command.Item>
  );
}
