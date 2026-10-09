import { useCallback, useEffect, useState } from 'react';
import type { BattlePublic } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { BattleGrid } from './BattleGrid.tsx';
import { Card, CardTitle, toast } from '../ui/index.ts';

const ERR: Record<string, string> = { locked: 'Сейчас ходит мастер', bad_cell: 'Туда нельзя', no_token: 'Твоей фишки на поле нет', closed: 'Поле закрыто' };

/** Поле боя у игрока (этап 60): сверху «Бросков», пока мастер держит поле открытым. Ход — своя фишка, затем клетка. */
export function PlayerBattle() {
  const [b, setB] = useState<BattlePublic | null>(null);
  const [picked, setPicked] = useState(false);
  const load = useCallback(async () => {
    const r = await api<{ battle: BattlePublic | null }>('GET', '/api/player/battle');
    if (r.ok) setB(r.data.battle);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('battle:changed', ({ battle }) => setB(battle));
  if (!b) return null;
  const mine = b.tokens.find((t) => t.mine);
  const move = async (col: number, row: number) => {
    if (!picked || !mine || !b.playerMoves) return;
    const r = await api<{ battle: BattlePublic | null }>('POST', '/api/player/battle/move', { col, row });
    setPicked(false);
    if (r.ok) setB(r.data.battle);
    else toast.error(ERR[r.error] ?? 'Не получилось');
  };
  return (
    <Card className="zg-player-battle gap-2">
      <CardTitle>Поле боя{b.title ? `: ${b.title}` : ''}</CardTitle>
      <BattleGrid
        cols={b.cols}
        rows={b.rows}
        terrain={b.terrain}
        tokens={b.tokens}
        selected={picked && mine ? mine.id : null}
        onCell={b.playerMoves && mine ? (c, r) => void move(c, r) : undefined}
        onToken={b.playerMoves && mine ? (id) => setPicked(id === mine.id ? !picked : false) : undefined}
      />
      <p className="m-0 text-[13px] text-muted">
        {!mine
          ? 'Твоей фишки на поле пока нет.'
          : b.playerMoves
            ? picked
              ? 'Нажми клетку, куда идти.'
              : 'Нажми свою фишку (в золотой рамке), затем клетку.'
            : 'Фишки двигает мастер.'}
      </p>
    </Card>
  );
}
