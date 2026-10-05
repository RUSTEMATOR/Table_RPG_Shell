import { useCallback, useEffect, useState } from 'react';
import type { PlayerCharacter } from '@zg/shared';
import { Feed } from '../components/Feed.tsx';
import { PlayerCard } from '../components/PlayerCard.tsx';
import { RollPanel } from '../components/RollPanel.tsx';
import { RoleScreen } from '../components/Shell.tsx';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { useWakeLock } from '../lib/wakeLock.ts';

export function Player() {
  useWakeLock();
  return (
    <RoleScreen role="player">
      <RollPanel role="player" />
      <section className="card">
        <h2>Лента</h2>
        <Feed />
      </section>
      <PlayerHome />
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
      <PlayerCard c={character} />
    </section>
  );
}
