import { useCallback, useEffect, useState } from 'react';
import type { PlayerCharacter } from '@zg/shared';
import { Feed } from '../components/Feed.tsx';
import { PlayerCard } from '../components/PlayerCard.tsx';
import { RollPanel } from '../components/RollPanel.tsx';
import { Diary } from '../components/Diary.tsx';
import { load as loadPref, save as savePref } from '../lib/storage.ts';
import { RoleScreen } from '../components/Shell.tsx';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { useWakeLock } from '../lib/wakeLock.ts';

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
    if (r.ok) setCharacter(r.data.character);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('character:updated', ({ character: c }) => setCharacter(c));
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
    <section className="card">
      <PlayerCard c={character} onChange={setCharacter} />
    </section>
  );
}

type Tab = 'card' | 'rolls' | 'diary';

function PlayerTabs() {
  const [tab, setTab] = useState<Tab>(() => (loadPref('zg:player:tab') as Tab | null) ?? 'rolls');
  const pick = (t: Tab) => {
    setTab(t);
    savePref('zg:player:tab', t);
  };
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
          </button>
        ))}
      </nav>
      {tab === 'rolls' && (
        <>
          <RollPanel role="player" />
          <section className="card">
            <h2>Лента</h2>
            <Feed />
          </section>
        </>
      )}
      {tab === 'card' && <PlayerHome />}
      {tab === 'diary' && <Diary />}
    </>
  );
}
