import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PlayerCharacter } from '@zg/shared';
import { Feed } from '../components/Feed.tsx';
import { isOwnRoll, type FeedRoll } from '../lib/feed.ts';
import { useMe } from '../lib/me.tsx';
import { PlayerCard } from '../components/PlayerCard.tsx';
import { RollPanel } from '../components/RollPanel.tsx';
import { Diary } from '../components/Diary.tsx';
import { load as loadPref, save as savePref } from '../lib/storage.ts';
import { RoleScreen } from '../components/Shell.tsx';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { useWakeLock } from '../lib/wakeLock.ts';
import { capabilities } from '../lib/capabilities.ts';
import { resolveTheme, themeVariant } from '../lib/cardTheme/index.ts';
import { useScheme } from '../lib/colorScheme.ts';
import { ThemeChoice } from '../components/ThemeChoice.tsx';
import { TAB_ICONS, TabBar } from '../components/TabBar.tsx';
import { Card, CardTitle, Segmented, Skeleton } from '../ui/index.ts';
import { useSkin } from '../lib/cardTheme/skin.ts';
import { noteCardChange, noteDiaryChange, rememberCard, setActiveTab, useUnread } from '../lib/unread.ts';

export function Player() {
  useWakeLock();
  return (
    <RoleScreen role="player" fill>
      <PlayerTabs />
    </RoleScreen>
  );
}

function PlayerHome({ active, theme, base, choice, onChoice }: { active: boolean; theme: string; base: string; choice: string; onChoice: (k: string) => void }) {
  const [character, setCharacter] = useState<PlayerCharacter | null | undefined>(undefined);
  const load = useCallback(async () => {
    const r = await api<{ character: PlayerCharacter | null }>('GET', '/api/player/character');
    if (r.ok) setCharacter(r.data.character);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('character:updated', ({ character: c }) => setCharacter(c));
  // Карточка считается увиденной, только когда вкладка на экране: иначе значок «есть новое» не появится.
  useEffect(() => {
    if (active && character !== undefined) rememberCard(character);
  }, [active, character]);
  // После переподключения перечитываем: пока связи не было, события могли пройти мимо.
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);

  if (character === undefined) return <Skeleton className="h-64" />;
  if (character === null)
    return (
      <Card>
        <p className="m-0 text-muted">Мастер ещё не выдал тебе персонажа.</p>
      </Card>
    );
  return (
    <>
      <ThemeChoice base={base} value={choice} onChange={onChoice} />
      <PlayerCard className="reveal" c={character} theme={theme} onChange={setCharacter} />
    </>
  );
}

// Карта — отдельный чанк (рендерер и рельеф): в первую загрузку экрана игрока не входит.
const PlayerMap = lazy(() => import('../components/PlayerMap.tsx').then((m) => ({ default: m.PlayerMap })));

type Tab = 'card' | 'rolls' | 'diary' | 'map';
const TABS: Tab[] = ['rolls', 'card', 'diary', 'map'];
const isTab = (v: string | null | undefined): v is Tab => TABS.includes(v as Tab);

/**
 * Вкладки игрока: пейджер на scroll-snap, свайп или панель внизу. У каждой вкладки своя прокрутка.
 * Открытая сначала вкладка монтируется сразу, остальные — чуть позже и дальше живут (свайп не упирается в пустоту).
 */
function PlayerTabs() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = loadPref('zg:player:tab');
    return isTab(saved) ? saved : 'rolls';
  });
  const [mounted, setMounted] = useState<ReadonlySet<Tab>>(() => new Set([tab]));
  useEffect(() => {
    // карта (рельеф ~100 КБ и данные) — только когда игрок до неё дойдёт
    const t = window.setTimeout(() => setMounted((m) => new Set([...m, ...TABS.filter((x) => x !== 'map')])), 900);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    setActiveTab(tab);
    savePref('zg:player:tab', tab);
  }, [tab]);
  useEffect(() => () => setActiveTab(null), []);

  const pager = useRef<HTMLDivElement>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  // Куда листаем по нажатию на панель: промежуточные вкладки по пути не считаются открытыми (значки на них остаются).
  const target = useRef<Tab | null>(null);
  useLayoutEffect(() => {
    const el = pager.current;
    if (el) el.scrollLeft = TABS.indexOf(tab) * el.clientWidth;
  }, []); // только при открытии экрана
  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const t = (e.target as HTMLElement).dataset.tab;
          if (!isTab(t)) continue;
          if (target.current && target.current !== t) continue;
          target.current = null;
          setTab(t);
          setMounted((m) => (m.has(t) ? m : new Set([...m, t])));
        }
      },
      { root: el, threshold: 0.6 },
    );
    el.querySelectorAll('[data-tab]').forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, []);
  const pick = (t: Tab) => {
    const el = pager.current;
    if (!el) return;
    if (t === tab) {
      // повторное нажатие — к началу вкладки
      el.querySelector<HTMLElement>(`[data-tab="${t}"]`)?.scrollTo({ top: 0, behavior: capabilities.reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    target.current = t;
    setMounted((m) => (m.has(t) ? m : new Set([...m, t])));
    el.scrollTo({ left: TABS.indexOf(t) * el.clientWidth, behavior: capabilities.reducedMotion() ? 'auto' : 'smooth' });
  };
  // Поворот телефона: остаться на своей вкладке.
  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!target.current) el.scrollLeft = TABS.indexOf(tabRef.current) * el.clientWidth;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const unread = useUnread();
  // Тема экрана: выбор игрока на этом устройстве, иначе тема персонажа; «День» / «Ночь» — её вариант.
  const { me } = useMe();
  const base = usePlayerSkin();
  const choiceKey = `zg:player:cardTheme:${me?.member.id ?? ''}`;
  const [choice, setChoice] = useState(() => loadPref(choiceKey) ?? '');
  const pickTheme = (k: string) => {
    setChoice(k);
    savePref(choiceKey, k);
  };
  const scheme = useScheme();
  const theme = themeVariant(choice || base, scheme);
  useSkin(theme);
  // Значки ставятся здесь, а не во вкладках: вкладки слушают события, только чтобы обновить себя.
  useSocketEvent('diary:changed', ({ entry }) => noteDiaryChange(entry));
  useSocketEvent('character:updated', ({ character }) => noteCardChange(character));

  const pane = (t: Tab, children: ReactNode) => (
    <section
      key={t}
      id={`pane-${t}`}
      data-tab={t}
      aria-label={LABELS[t]}
      inert={t !== tab}
      className="flex w-full shrink-0 snap-start snap-always flex-col gap-3.5 overflow-y-auto overscroll-y-contain px-4 pt-1 pb-4"
    >
      {mounted.has(t) && children}
    </section>
  );
  return (
    <>
      <div
        ref={pager}
        className="-mx-4 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pane(
          'rolls',
          <>
            <RollPanel role="player" />
            <FeedCard />
          </>,
        )}
        {pane('card', <PlayerHome active={tab === 'card'} theme={theme} base={base} choice={choice} onChoice={pickTheme} />)}
        {pane('diary', <Diary active={tab === 'diary'} />)}
        {pane(
          'map',
          <Suspense fallback={<p className="muted">Загрузка карты…</p>}>
            <PlayerMap active={tab === 'map'} />
          </Suspense>,
        )}
      </div>
      <TabBar
        value={tab}
        onChange={pick}
        controls={(v) => `pane-${v}`}
        items={[
          { value: 'rolls', label: LABELS.rolls, icon: TAB_ICONS.rolls },
          { value: 'card', label: LABELS.card, icon: TAB_ICONS.card, dot: unread.card },
          { value: 'diary', label: LABELS.diary, icon: TAB_ICONS.diary, dot: unread.diary },
          { value: 'map', label: LABELS.map, icon: TAB_ICONS.map },
        ]}
      />
    </>
  );
}

const LABELS: Record<Tab, string> = { rolls: 'Броски', card: 'Карточка', diary: 'Дневник', map: 'Карта' };

/** Лента игрока с фильтром «Все» / «Мои». Выбор запоминается на устройстве. */
function FeedCard() {
  const { me } = useMe();
  const [mine, setMine] = useState(() => loadPref('zg:player:feed') === 'mine');
  const pick = (v: boolean) => {
    setMine(v);
    savePref('zg:player:feed', v ? 'mine' : 'all');
  };
  const name = me?.member.name;
  const only = mine ? (r: FeedRoll) => isOwnRoll(r.id) || r.who === name : undefined;
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <CardTitle>Лента</CardTitle>
        <Segmented
          label="Чьи броски"
          value={mine ? 'mine' : 'all'}
          onChange={(v) => pick(v === 'mine')}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'mine', label: 'Мои' },
          ]}
        />
      </div>
      <Feed only={only} />
    </Card>
  );
}

/** Тема экрана игрока — тема его персонажа. Запоминается на устройстве, чтобы при открытии не мигал обычный вид. */
function usePlayerSkin(): string {
  const [skin, setSkin] = useState(() => loadPref('zg:player:skin') ?? 'other');
  const take = useCallback((c: PlayerCharacter | null) => {
    const th = c ? resolveTheme(c.look) : 'other';
    setSkin(th);
    savePref('zg:player:skin', th);
  }, []);
  useEffect(() => {
    void api<{ character: PlayerCharacter | null }>('GET', '/api/player/character').then((r) => r.ok && take(r.data.character));
  }, [take]);
  useSocketEvent('character:updated', ({ character }) => take(character));
  return skin;
}
