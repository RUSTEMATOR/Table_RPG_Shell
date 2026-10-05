import type { PlayerCharacter } from '@zg/shared';

const DEMAND = ['', 'почти не нужна', 'пригодится', 'нарасхват'];

/** Карточка, как её видит игрок. Используется и в предпросмотре у мастера. */
export function PlayerCard({ c }: { c: PlayerCharacter }) {
  const sub = [c.origin, c.pronoun !== 'не указано' ? c.pronoun : '', c.powerBand ? `Уровень силы: ${c.powerBand}` : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="pcard">
      <div>
        <h2 className="pcard-name">{c.name}</h2>
        {sub && <p className="muted small">{sub}</p>}
      </div>
      {c.bio && <p className="pcard-bio">{c.bio}</p>}
      {c.profession && (
        <section className="trait">
          <p className="trait-cat">Ремесло в Зеленогорье</p>
          <h3 className="trait-name">{c.profession.label}</h3>
          {c.profession.local && <p>Местный аналог: {c.profession.local}</p>}
          {c.profession.demand > 0 && <p className="small muted">Спрос: {DEMAND[c.profession.demand]}</p>}
          {c.profession.edge && <p>{c.profession.edge}</p>}
        </section>
      )}
      {c.traits.map((t, i) => (
        <section key={i} className="trait">
          <p className="trait-cat">{t.cat}</p>
          <h3 className="trait-name">{t.name}</h3>
          <p>{t.d}</p>
          {t.stagesShown.length > 0 && (
            <ol className="steps">
              {t.stagesShown.map((s, k) => (
                <li key={k}>{s}</li>
              ))}
            </ol>
          )}
          {t.price && <p className="small">Цена: {t.price}</p>}
          {t.hint && <p className="hint-note">{t.hint}</p>}
        </section>
      ))}
      {c.hints.map((h, i) => (
        <section key={`h${i}`} className="trait trait-hint">
          <p className="trait-cat">Что-то происходит</p>
          <p>{h}</p>
        </section>
      ))}
      {c.summary && (
        <section className="trait">
          <p className="trait-cat">Вступление</p>
          <p className="prewrap">{c.summary}</p>
        </section>
      )}
      {c.crossing && (
        <section className="trait">
          <p className="trait-cat">Сцена перехода</p>
          <p className="prewrap">{c.crossing}</p>
        </section>
      )}
      {c.traits.length === 0 && c.hints.length === 0 && !c.bio && (
        <p className="muted">Мир пока присматривается к тебе.</p>
      )}
    </div>
  );
}
