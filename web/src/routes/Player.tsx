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
import { noteCardChange, noteDiaryChange, rememberCard, setActiveTab, useUnread } from '../lib/unread.ts';

export function Player() {
  useWakeLock();
  return (
    <RoleScreen role="player">
      <PlayerTabs />
    </RoleScreen>
  );
}

function PlayerHome() {
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
    <PlayerCard
      c={character}
      onChange={(c) => {
        setCharacter(c);
        rememberCard(c);
      }}
    />
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
  // Значки ставятся здесь, а не во вкладках: вкладка, которая не открыта, событий не слушает.
  useSocketEvent('diary:changed', ({ entry }) => noteDiaryChange(entry));
  useSocketEvent('character:updated', ({ character }) => noteCardChange(character));
  return (
    <>
      <nav className="gm-nav" aria-label="Разделы">
        {(
          [
            ['rolls', 'Броски'],
            ['card', 'Карточка'],
            ['diary', 'Дневник'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" className={`tab ${tab === k ? 'tab-on' : ''}`} onClick={() => pick(k)}>
            {l}
            {k !== 'rolls' && unread[k] && <span className="unread-dot" aria-label="есть новое" />}
          </button>
        ))}
      </nav>
      {tab === 'rolls' && (
        <>
          <RollPanel role="player" />
          <FeedCard />
        </>
      )}
      {tab === 'card' && <PlayerHome />}
      {tab === 'diary' && <Diary />}
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
