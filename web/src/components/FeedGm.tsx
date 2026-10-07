import { useState } from 'react';
import { EFFECTS, EFFECT_LABELS, type Effect } from '@zg/shared';
import type { FeedRoll } from '../lib/feed.ts';
import { emitGm } from '../lib/socket.ts';
import { api } from '../lib/api.ts';
import { dismissGreen, useGreenSuggestions } from '../lib/suggestions.ts';
import { Button, EFFECT_ICON, GameIcon, Input, Select, toast } from '../ui/index.ts';

// Мастерская часть строки ленты: исправить бросок, подсказка зелёной магии. Отдельный чанк: игроку не нужен.

export function Override({ r }: { r: FeedRoll }) {
  const [open, setOpen] = useState(false);
  const [effect, setEffect] = useState<Effect>(r.effect);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" className="linkish" onClick={() => setOpen(true)}>
        Исправить
      </button>
    );
  return (
    <div className="mt-2 grid gap-2 rounded-control border border-solid border-border bg-surface p-3 text-text">
      <div className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)]">
        <Select
          aria-label="Исход"
          value={effect}
          onValueChange={(v) => setEffect(v as Effect)}
          options={EFFECTS.map((k) => ({
            value: k,
            label: (
              <span className="inline-flex items-center gap-2">
                <GameIcon name={EFFECT_ICON[k]} className="text-muted" />
                {EFFECT_LABELS[k]}
              </span>
            ),
          }))}
        />
        <Input aria-label="Почему" placeholder="Почему (видит только мастер)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={async () => {
            const res = await emitGm('gm:roll.override', { rollId: r.id, effect, note });
            if (res.ok) {
              setOpen(false);
              toast('Бросок исправлен');
            } else setErr(res.error ?? 'ошибка');
          }}
        >
          Сохранить
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
      {err && <p className="error m-0">{err}</p>}
    </div>
  );
}

export function GreenHint({ rollId }: { rollId: string }) {
  const green = useGreenSuggestions().get(rollId);
  if (!green) return null;
  return (
    <div className="jev-note row">
      <span>Похоже на зелёную магию ({Math.round(green.probability * 100)}%).</span>
      <Button
        size="sm"
        onClick={async () => {
          const r = await api('POST', `/api/gm/overload/${encodeURIComponent(green.characterId)}`, { delta: 1 });
          if (r.ok) {
            dismissGreen(rollId);
            toast('+1 перегрузки');
          }
        }}
      >
        +1 перегрузки
      </Button>
      <Button size="sm" variant="ghost" onClick={() => dismissGreen(rollId)}>
        Нет
      </Button>
    </div>
  );
}
