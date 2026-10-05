import { useCallback, useEffect, useState } from 'react';
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
import { resolveTheme, themeVariant } from '../lib/cardTheme/index.ts';
import { useScheme } from '../lib/colorScheme.ts';
import { ThemeChoice } from '../components/ThemeChoice.tsx';
import { TAB_ICONS, TabBar } from '../components/TabBar.tsx';
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

function PlayerHome({ theme, base, choice, onChoice }: { theme: string; base: string; choice: string; onChoice: (k: string) => void }) {
  const [character, setCharacter] = useState<PlayerCharacter | null | undefined>(undefined);
  const load = useCallback(async () => {
    const r = await api<{ character: PlayerCharacter | null }>('GET', '/api/player/character');
    if (r.ok) {
      setCharacter(r.data.character);
      rememberCard(r.data.character);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('character:updated', ({ character: c }) => {
    setCharacter(c);
    rememberCard(c);
  });
  // После переподключения перечитываем: пока связи не было, события могли пройти мимо.
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);

  if (character === undefined) return <p className="muted">Загрузка…</p>;
  if (character === null)
    return (
      <section className="card">
        <p className="muted">Мастер ещё не выдал тебе персонажа.</p>
      </section>
    );
  return (
    <>
      <ThemeChoice base={base} value={choice} onChange={onChoice} />
      <PlayerCard
        c={character}
        theme={theme}
        onChange={(c) => {
          setCharacter(c);
          rememberCard(c);
        }}
      />
    </>
  );
}

type Tab = 'card' | 'rolls' | 'diary';

function PlayerTabs() {
  const [tab, setTab] = useState<Tab>(() => (loadPref('zg:player:tab') as Tab | null) ?? 'rolls');
  const pick = (t: Tab) => {
    setTab(t);
    savePref('zg:player:tab', t);
  };
  useEffect(() => setActiveTab(tab), [tab]);
  useEffect(() => () => setActiveTab(null), []);
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
  // Значки ставятся здесь, а не во вкладках: вкладка, которая не открыта, событий не слушает.
  useSocketEvent('diary:changed', ({ entry }) => noteDiaryChange(entry));
  useSocketEvent('character:updated', ({ character }) => noteCardChange(character));
  return (
    <>
      <div id={`pane-${tab}`} className="-mx-4 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-4 pt-1 pb-4">
        {tab === 'rolls' && (
          <>
            <RollPanel role="player" />
            <FeedCard />
          </>
        )}
        {tab === 'card' && <PlayerHome theme={theme} base={base} choice={choice} onChoice={pickTheme} />}
        {tab === 'diary' && <Diary />}
      </div>
      <TabBar
        value={tab}
        onChange={pick}
        controls={(v) => `pane-${v}`}
        items={[
          { value: 'rolls', label: 'Броски', icon: TAB_ICONS.rolls },
          { value: 'card', label: 'Карточка', icon: TAB_ICONS.card, dot: unread.card },
          { value: 'diary', label: 'Дневник', icon: TAB_ICONS.diary, dot: unread.diary },
        ]}
      />
    </>
  );
}

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
    <section className="card">
      <div className="row spread">
        <h2>Лента</h2>
        <div className="row">
          <button type="button" className={`tab ${!mine ? 'tab-on' : ''}`} onClick={() => pick(false)}>
            Все
          </button>
          <button type="button" className={`tab ${mine ? 'tab-on' : ''}`} onClick={() => pick(true)}>
            Мои
          </button>
        </div>
      </div>
      <Feed only={only} />
    </section>
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

