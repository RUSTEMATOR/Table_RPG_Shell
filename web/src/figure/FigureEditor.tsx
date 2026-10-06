import { useMemo, useState, type ReactNode } from 'react';
import { FIGURE_SLOTS, type Figure, type FigurePart, type FigureSlot } from '@zg/shared';
import { COLOR_LABELS, DEFAULT_FIGURE, OPTIONAL, SKINS, SLOT_LABELS, catalog, colorChoices, item, palettes, randomFigure, type Item } from './catalog.ts';
import { FigureSprite, type Dir, type Pose } from './FigureSprite.tsx';
import { FigureCredits } from './FigureCredits.tsx';
import { Button, Segmented } from '../ui/index.ts';
import { cn } from '../lib/cn.ts';

const DIRS: Dir[] = ['down', 'left', 'up', 'right'];
const ATTACK_LABEL: Record<string, string> = { slash: 'удар', thrust: 'выпад', shoot: 'выстрел', spellcast: 'заклинание' };

/** Образец цвета: средний оттенок палитры материала или условный цвет варианта. */
function swatch(material: keyof typeof palettes | null, key: string): string {
  const p = material ? palettes[material]?.[key] : undefined;
  if (p?.length) return p[Math.min(p.length - 2, Math.floor(p.length / 2))]!;
  return (
    { blue: '#3b6fd8', red: '#c23a2b', steel: '#9aa4ad', iron: '#6f6a64', bronze: '#a8733c', gold: '#d8b23a', medium: '#8a5a2c', light: '#c99a5a', dark: '#4a2e1a' }[key] ??
    '#999999'
  );
}

/**
 * Конструктор фигурки (макет «Игрок · Фигурка»): превью с поворотом и позами, части фигурки, варианты миниатюрами,
 * цвета, «Случайно», «Сохранить». Общий для игрока (своя фигурка) и мастера (любой персонаж и противник).
 */
export function FigureEditor({
  value,
  onSave,
  onClear,
  note,
}: {
  value: Figure | null;
  onSave: (f: Figure) => Promise<boolean>;
  /** Убрать фигурку совсем (у мастера); без него кнопки нет. */
  onClear?: () => Promise<boolean>;
  note?: string;
}) {
  const [draft, setDraft] = useState<Figure>(value ?? DEFAULT_FIGURE);
  const [slot, setSlot] = useState<FigureSlot>('hair');
  const [dir, setDir] = useState(0);
  const [pose, setPose] = useState<Pose>('walk');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value ?? null);
  // Фигурку поменяли в другом месте (мастер, другое устройство): подхватить, если здесь ничего не правили.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (JSON.stringify(draft) === JSON.stringify(seen ?? DEFAULT_FIGURE)) setDraft(value ?? DEFAULT_FIGURE);
  }

  const items = useMemo(() => (catalog.slots[slot] ?? []).filter((i) => i.bodies.includes(draft.body)), [slot, draft.body]);
  const current = draft.parts[slot];
  const cur = item(slot, current?.id);
  const colors = slot === 'body' ? [] : colorChoices(slot, cur);
  const material = cur?.colors?.kind === 'palette' ? cur.colors.material : null;

  const setPart = (s: FigureSlot, p: FigurePart | undefined) => setDraft((f) => ({ ...f, parts: { ...f.parts, [s]: p } }));
  const choose = (it: Item | null) => {
    if (!it) return setPart(slot, undefined);
    // голова не-человека (орк, волк, скелет) — кожа её родного цвета, чтобы тело совпало с головой
    const skin = ownSkin(it);
    if (skin) {
      return setDraft((f) => ({ ...f, skin, parts: { ...f.parts, head: { id: it.id } } }));
    }
    const keep = current?.color && colorChoices(slot, it).includes(current.color) ? current.color : undefined;
    const first = colorChoices(slot, it)[0];
    setPart(slot, { id: it.id, ...(keep ? { color: keep } : it.colors?.kind === 'variants' && first ? { color: first } : {}) });
  };
  const ownSkin = (it: Item | null) =>
    slot === 'head' && it && !it.id.startsWith('human_') && it.colors?.kind === 'palette' && it.colors.material === 'body' ? it.colors.base : null;
  const withItem = (it: Item | null): Figure => ({
    ...draft,
    skin: ownSkin(it) ?? draft.skin,
    parts: { ...draft.parts, [slot]: it ? { id: it.id, ...(current?.color ? { color: current.color } : {}) } : undefined },
  });

  const save = async () => {
    setBusy(true);
    await onSave(draft);
    setBusy(false);
  };
  const clear = async () => {
    if (!onClear) return;
    setBusy(true);
    if (await onClear()) setDraft(DEFAULT_FIGURE);
    setBusy(false);
  };

  return (
    <div className="grid gap-3">
      <section
        aria-label="Фигурка"
        className="relative grid h-[268px] items-end justify-items-center overflow-hidden rounded-sheet border border-solid border-border bg-surface-2 pb-3 [background-image:linear-gradient(45deg,color-mix(in_srgb,var(--accent)_7%,transparent)_25%,transparent_25%,transparent_75%,color-mix(in_srgb,var(--accent)_7%,transparent)_75%),linear-gradient(45deg,color-mix(in_srgb,var(--accent)_7%,transparent)_25%,transparent_25%,transparent_75%,color-mix(in_srgb,var(--accent)_7%,transparent)_75%)] [background-position:0_0,12px_12px] [background-size:24px_24px]"
      >
        <div aria-hidden="true" className="absolute bottom-[62px] left-1/2 h-[18px] w-[120px] -translate-x-1/2 rounded-[50%] bg-black/15" />
        <div className="relative mb-6 grid place-items-center">
          <FigureSprite figure={draft} pose={pose} dir={DIRS[dir]} size={192} label="Фигурка" />
        </div>
        <Button variant="ghost" size="icon" aria-label="Повернуть влево" className="absolute top-[104px] left-2.5 bg-surface/75" onClick={() => setDir((d) => (d + 1) % 4)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Button>
        <Button variant="ghost" size="icon" aria-label="Повернуть вправо" className="absolute top-[104px] right-2.5 bg-surface/75" onClick={() => setDir((d) => (d + 3) % 4)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Button>
        <Segmented
          label="Поза"
          value={pose}
          onChange={setPose}
          className="relative"
          options={[
            { value: 'idle', label: 'Стоит' },
            { value: 'walk', label: 'Идёт' },
            { value: 'attack', label: 'Удар' },
            { value: 'hurt', label: 'Ранен' },
          ]}
        />
      </section>

      <nav aria-label="Части фигурки" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {FIGURE_SLOTS.map((s) => (
          <Button key={s} size="sm" variant={s === slot ? 'primary' : 'ghost'} aria-current={s === slot || undefined} className="shrink-0" onClick={() => setSlot(s)}>
            {SLOT_LABELS[s]}
          </Button>
        ))}
      </nav>

      {slot === 'body' && (
        <Segmented
          label="Телосложение"
          value={draft.body}
          onChange={(b) =>
            setDraft((f) => ({
              ...f,
              body: b,
              parts: { ...f.parts, head: f.parts.head?.id?.startsWith('human_') ? { id: b === 'male' ? 'human_male' : 'human_female' } : f.parts.head },
            }))
          }
          options={[
            { value: 'female', label: 'Женское' },
            { value: 'male', label: 'Мужское' },
          ]}
          className="justify-self-start"
        />
      )}

      <div role="radiogroup" aria-label={SLOT_LABELS[slot]} className="grid grid-cols-4 gap-2 min-[480px]:grid-cols-6">
        {OPTIONAL.includes(slot) && (
          <Option on={!current} label="Нет" onPick={() => choose(null)}>
            <FigureSprite figure={withItem(null)} pose="idle" size={64} paused />
          </Option>
        )}
        {items.map((it) => (
          <Option key={it.id} on={current?.id === it.id} label={it.label} sub={slot === 'weapon' && it.attack ? ATTACK_LABEL[it.attack] : undefined} onPick={() => choose(it)}>
            <FigureSprite figure={withItem(it)} pose={slot === 'weapon' ? 'attack' : 'idle'} dir={slot === 'weapon' ? 'right' : 'down'} size={64} paused />
          </Option>
        ))}
      </div>

      {(slot === 'body' || slot === 'head' || colors.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-12 font-ui text-xs tracking-[.06em] text-muted uppercase">{slot === 'body' || slot === 'head' ? 'Кожа' : 'Цвет'}</span>
          <div role="radiogroup" aria-label={slot === 'body' || slot === 'head' ? 'Цвет кожи' : 'Цвет'} className="flex flex-wrap gap-2">
            {(slot === 'body' || slot === 'head' ? SKINS : colors).map((c) => {
              const on =
                slot === 'body' || slot === 'head' ? draft.skin === c : current?.color === c || (!current?.color && cur?.colors?.kind === 'palette' && cur.colors.base === c);
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={COLOR_LABELS[c] ?? c}
                  title={COLOR_LABELS[c] ?? c}
                  onClick={() => (slot === 'body' || slot === 'head' ? setDraft((f) => ({ ...f, skin: c })) : current && setPart(slot, { ...current, color: c }))}
                  className={cn(
                    'size-8 cursor-pointer rounded-full border-[3px] border-solid border-surface',
                    on ? 'shadow-[0_0_0_2px_var(--accent)]' : 'shadow-[0_0_0_1px_var(--border)]',
                  )}
                  style={{ background: swatch(slot === 'body' || slot === 'head' ? 'body' : material, c) }}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={() => setDraft(randomFigure())}>
          Случайно
        </Button>
        <Button variant="primary" className="flex-[2]" disabled={busy || !dirty} onClick={save}>
          {busy ? 'Сохраняю…' : 'Сохранить фигурку'}
        </Button>
      </div>
      {onClear && value && (
        <Button variant="ghost" className="justify-self-start" disabled={busy} onClick={clear}>
          Убрать фигурку
        </Button>
      )}
      {note && <p className="m-0 text-[13.6px] text-muted">{note}</p>}
      <FigureCredits />
    </div>
  );
}

function Option({ on, label, sub, onPick, children }: { on: boolean; label: string; sub?: string | undefined; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn(
        'grid cursor-pointer justify-items-center gap-0.5 rounded-control bg-surface px-1 pt-1.5 pb-1 font-ui text-xs leading-tight text-text',
        on ? 'border-2 border-solid border-accent' : 'border border-solid border-border',
      )}
    >
      <span className="grid size-16 place-items-center overflow-hidden">{children}</span>
      <span className="line-clamp-2 text-center">{label}</span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </button>
  );
}
