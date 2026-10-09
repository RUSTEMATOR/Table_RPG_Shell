import { lazy, Suspense } from 'react';
import { gridSize, hexCenter, hexPoints, type Figure, type Terrain, type TerrainCell } from '@zg/shared';
import { cn } from '../lib/cn.ts';

const FigureSprite = lazy(() => import('../figure/FigureSprite.tsx').then((m) => ({ default: m.FigureSprite })));

// Поле боя (этап 60): SVG-сетка шестиугольников и фишки поверх (HTML, чтобы рисовать фигурки). Общая для мастера, игрока
// и стола. Координаты — в «радиусах» шестиугольника; контейнер держит пропорции поля.

export type GridToken = { id: string; name: string; figure: Figure | null; col: number; row: number; kind: 'character' | 'npc' | 'mark'; mine?: boolean; hidden?: boolean };

const FILL: Record<Terrain, string> = { wall: '#4a4038', rough: '#7a6a3c', water: '#3c6a8a' };

export function BattleGrid({
  cols,
  rows,
  terrain,
  tokens,
  selected,
  onCell,
  onToken,
  big,
  className,
}: {
  cols: number;
  rows: number;
  terrain: TerrainCell[];
  tokens: GridToken[];
  selected?: string | null;
  onCell?: (col: number, row: number) => void;
  onToken?: (id: string) => void;
  /** Стол: крупные подписи. */
  big?: boolean;
  className?: string;
}) {
  const { w, h } = gridSize(cols, rows);
  const ter = new Map(terrain.map((t) => [`${t.col},${t.row}`, t.t]));
  const cells: { col: number; row: number }[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) cells.push({ col, row });
  const pct = (x: number, y: number) => ({ left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%` });
  const tokenSize = `${(1.7 / w) * 100}%`;
  return (
    <div className={cn('zg-battle relative w-full select-none', className)} style={{ aspectRatio: `${w} / ${h}` }}>
      <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 size-full" role="img" aria-label="Поле боя">
        {cells.map(({ col, row }) => {
          const t = ter.get(`${col},${row}`);
          return (
            <polygon
              key={`${col},${row}`}
              points={hexPoints(col, row, 0.97)}
              fill={t ? FILL[t] : 'rgba(120,140,100,.18)'}
              stroke="rgba(30,30,20,.35)"
              strokeWidth={0.04}
              className={cn(onCell && 'cursor-pointer hover:brightness-125')}
              onClick={onCell ? () => onCell(col, row) : undefined}
            />
          );
        })}
      </svg>
      {tokens.map((t) => {
        const c = hexCenter(t.col, t.row);
        return (
          <button
            key={t.id}
            type="button"
            title={t.name}
            disabled={!onToken}
            onClick={onToken ? () => onToken(t.id) : undefined}
            className={cn(
              'absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-solid bg-[rgba(243,236,217,.85)] p-0 transition-[left,top] duration-500 ease-out disabled:cursor-default',
              t.kind === 'npc' ? 'border-[#9a3b2f]' : t.kind === 'mark' ? 'border-[#6b6b6b]' : 'border-[#3b5f9a]',
              t.mine && 'border-[#c9971f] shadow-[0_0_0_3px_rgba(201,151,31,.45)]',
              selected === t.id && 'ring-4 ring-[#e8c25a]',
              t.hidden && 'opacity-50',
              onToken && 'cursor-pointer',
            )}
            style={{ ...pct(c.x, c.y), width: tokenSize, aspectRatio: '1' }}
          >
            {t.figure ? (
              <Suspense fallback={null}>
                <FigureSprite figure={t.figure} size={big ? 96 : 48} paused className="pointer-events-none size-[90%]" />
              </Suspense>
            ) : (
              <span className={cn('font-ui font-bold text-[#2a241c]', big ? 'text-[1.6vw]' : 'text-[11px]')}>{(t.name.trim()[0] ?? '?').toUpperCase()}</span>
            )}
            <span
              className={cn(
                'pointer-events-none absolute top-full left-1/2 mt-0.5 -translate-x-1/2 rounded bg-[rgba(20,16,10,.7)] px-1 whitespace-nowrap text-[#f3ecd9]',
                big ? 'text-[1vw]' : 'text-[10px]',
              )}
            >
              {t.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
