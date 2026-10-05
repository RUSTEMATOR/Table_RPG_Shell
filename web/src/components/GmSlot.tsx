import { useEffect, useState, type ReactNode } from 'react';
import type { GmSlotView } from '@zg/shared';
import { Button, Field, Textarea } from '../ui/index.ts';

const tierClass = (t: string) => `tier tier-${t}`;

export function TierChip({ s }: { s: Pick<GmSlotView, 'tier' | 'tierLabel'> }) {
  return <span className={tierClass(s.tier)}>{s.tierLabel}</span>;
}

function Layers({ s }: { s: GmSlotView }) {
  const g = s.gm;
  const one = (label: string, text: string) =>
    text ? (
      <p>
        <b>{label}:</b> {text}
      </p>
    ) : null;
  const list = (label: string, items: string[]) =>
    items.length ? (
      <div>
        <b>{label}:</b>
        <ul>
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    ) : null;
  return (
    <div className="gm-layers">
      {s.affinityNote && <p>{s.affinityNote}</p>}
      {s.hook && !g && one('Крючок', s.hook)}
      {g && (
        <>
          {g.personal && <p className="small muted">Под этого персонажа</p>}
          {one('Правда', g.truth)}
          {one('Признаки до раскрытия', g.signs)}
          {one('Признаки перегрузки', g.overload)}
          {list('Первое проявление (на выбор)', g.reveals)}
          {list('Крючки', g.hooks)}
          {one(g.triggerLabel, g.trigger)}
          {one('Если игрок догадался рано', g.ifEarly)}
          {one('Если игрок игнорирует', g.ifIgnored)}
          {g.combos.length > 0 && one('Сочетания', g.combos.join(', '))}
          {g.flavor && one(`Оттенок жанра (${g.flavorSrc})`, g.flavor)}
          {g.tierShift && one(`Другой тир (${g.tierLabel})`, g.tierShift)}
        </>
      )}
    </div>
  );
}

/** Слот черты на экране мастера. children — органы управления (переброс или ступени и раскрытие). */
export function GmSlot({ s, children, showLayers = true }: { s: GmSlotView; children?: ReactNode; showLayers?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`slot slot-${s.tier}`}>
      <div className="slot-top">
        <span className="trait-cat">{s.catLabel}</span>
        <TierChip s={s} />
        {s.matched && <span className="chip">совпал с архетипом</span>}
        {s.manual && <span className="chip">вручную</span>}
        {s.extra && <span className="chip">доп. слот</span>}
        {s.replaced && <span className="chip">вместо «{s.replaced}»</span>}
      </div>
      <h3 className="trait-name">{s.name}</h3>
      <p>{s.d}</p>
      {s.details.map((d) => (
        <p key={d.label} className="small">
          <b>{d.label}:</b> {d.text}
        </p>
      ))}
      {s.price && (
        <p className="small">
          <b>Цена:</b> {s.price}
        </p>
      )}
      <ol className="steps">
        {s.steps.map((st, i) => (
          <li key={i} className={i < s.stage ? 'step-done' : ''}>
            <b>{st.name}</b>
            {st.can ? `: ${st.can}` : ''}
            {st.cost ? <span className="muted"> (цена: {st.cost})</span> : null}
          </li>
        ))}
      </ol>
      {children}
      {showLayers && (s.gm || s.affinityNote || s.hook) && (
        <div className="more">
          <button type="button" className="linkish" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Скрыть для мастера' : 'Для мастера'}
          </button>
          {open && <Layers s={s} />}
        </div>
      )}
    </article>
  );
}

/** Текстовое поле, которое сохраняется по кнопке, а не на каждую букву. */
export function SaveField({
  value,
  onSave,
  label,
  rows = 2,
  maxLength,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => Promise<void> | void;
  label: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(value), [value]);
  const dirty = v !== value;
  return (
    <Field label={label}>
      {(id) => (
        <>
          <Textarea id={id} rows={rows} value={v} maxLength={maxLength} placeholder={placeholder} onChange={(e) => setV(e.target.value)} />
          {dirty && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onSave(v);
                  setBusy(false);
                }}
              >
                Сохранить
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setV(value)}>
                Отменить
              </Button>
            </div>
          )}
        </>
      )}
    </Field>
  );
}
