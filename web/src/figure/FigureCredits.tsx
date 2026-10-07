import { useEffect, useState } from 'react';
import { Button, ICON_SET, Sheet } from '../ui/index.ts';

type Credit = { name: string; licenses: string[]; urls: string[] };

/**
 * «Авторы графики»: детали фигурок взяты из открытого набора LPC (CC-BY-SA 3.0 / GPL 3.0 / OGA-BY / CC-BY), модели 3D-карты — KayKit (CC0),
 * значки — game-icons.net (CC BY 3.0, авторы — из web/src/ui/icons.json).
 * Эти лицензии требуют указать авторов — список собирает tools/extract-lpc из CREDITS.csv набора,
 * полная таблица по файлам лежит рядом с картинками: /lpc/CREDITS.csv.
 */
export function FigureCredits() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Credit[] | null>(null);
  useEffect(() => {
    if (open && !list) void import('./credits.json').then((m) => setList(m.default as Credit[]));
  }, [open, list]);
  return (
    <>
      <Button variant="ghost" size="sm" className="justify-self-start text-muted" onClick={() => setOpen(true)}>
        Авторы графики
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Авторы графики">
        <p className="m-0 text-[14px] text-muted">
          Фигурки собираются из деталей открытого набора{' '}
          <a href="https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator" target="_blank" rel="noreferrer" className="text-link">
            Liberated Pixel Cup
          </a>
          . Спасибо художникам. Лицензии: CC-BY-SA 3.0, GPL 2.0/3.0, OGA-BY 3.0, CC-BY 3.0/4.0, CC0 —{' '}
          <a href="/lpc/CREDITS.csv" target="_blank" rel="noreferrer" className="text-link">
            полный список по файлам
          </a>
          .
        </p>
        <p className="m-0 text-[14px] text-muted">
          Модели 3D-карты — набор{' '}
          <a href="https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0" target="_blank" rel="noreferrer" className="text-link">
            KayKit Medieval Hexagon Pack
          </a>{' '}
          Кея Лаусберга (Kay Lousberg), CC0.
        </p>
        <p className="m-0 text-[14px] text-muted">
          Значки —{' '}
          <a href="https://game-icons.net" target="_blank" rel="noreferrer" className="text-link">
            game-icons.net
          </a>
          , {ICON_SET.license}. Icons made by{' '}
          {Object.values(ICON_SET.authors).map((a, i, all) => (
            <span key={a.name}>
              <a href={a.url} target="_blank" rel="noreferrer" className="text-link">
                {a.name}
              </a>
              {i < all.length - 1 ? ', ' : ''}
            </span>
          ))}
          .
        </p>
        {!list ? (
          <p className="muted">Загрузка…</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {list.map((c) => (
              <li key={c.name} className="grid gap-0.5 border-b border-solid border-border pb-2 last:border-0">
                <span className="font-ui font-semibold">
                  {c.urls[0] ? (
                    <a href={c.urls[0]} target="_blank" rel="noreferrer" className="text-text">
                      {c.name}
                    </a>
                  ) : (
                    c.name
                  )}
                </span>
                <span className="text-[12.8px] text-muted">{c.licenses.join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
