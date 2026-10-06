import { useCallback, useEffect, useState } from 'react';
import type { Figure, PlayerCharacter } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';
import { FigureEditor } from '../figure/FigureEditor.tsx';
import { Card, toast } from '../ui/index.ts';

/** Вкладка «Фигурка» у игрока: конструктор пиксель-арт фигурки своего персонажа (этап 23). */
export function PlayerFigure() {
  const [character, setCharacter] = useState<PlayerCharacter | null | undefined>(undefined);
  const load = useCallback(async () => {
    const r = await api<{ character: PlayerCharacter | null }>('GET', '/api/player/character');
    if (r.ok) setCharacter(r.data.character);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('character:updated', ({ character: c }) => setCharacter(c));

  if (character === undefined) return <p className="muted">Загрузка…</p>;
  if (character === null)
    return (
      <Card>
        <p className="m-0 text-muted">Фигурку можно собрать, когда мастер выдаст тебе персонажа.</p>
      </Card>
    );
  const save = async (f: Figure) => {
    const r = await api<{ character: PlayerCharacter | null }>('POST', '/api/player/character/figure', f);
    if (!r.ok) {
      toast.error('Не сохранилось');
      return false;
    }
    setCharacter(r.data.character);
    toast('Фигурка сохранена');
    return true;
  };
  return <FigureEditor key={character.id} value={character.figure ?? null} onSave={save} note="Фигурку увидят мастер, стол и другие игроки — на карте и в бою." />;
}
