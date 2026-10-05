import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { GmAck, GmCharacterView, GmSlotView, HintCheck } from '@zg/shared';
import { GmSlot, SaveField } from '../components/GmSlot.tsx';
import { PlayerCard } from '../components/PlayerCard.tsx';
import { ThemePick } from '../components/ThemePick.tsx';
import { RoleScreen } from '../components/Shell.tsx';
import { SheetPanel } from '../components/SheetPanel.tsx';
import { SummaryPanel } from '../components/SummaryPanel.tsx';
import { api } from '../lib/api.ts';
import { OWNER_ERRORS, usePlayers } from '../lib/gm.ts';
import { emitGm, useConnection, useSocketEvent } from '../lib/socket.ts';

export function GmCharacter() {
  return (
    <RoleScreen role="gm">
      <CharacterPage />
    </RoleScreen>
  );
}

const STAGES = ['Спит', 'Пробуждение', 'Освоение', 'Мастерство', 'Предел'];

function CharacterPage() {
  const { id = '' } = useParams();
  const [c, setC] = useState<GmCharacterView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const players = usePlayers();

  const load = useCallback(async () => {
    const r = await api<GmCharacterView>('GET', `/api/gm/characters/${encodeURIComponent(id)}`);
    if (r.ok) setC(r.data);
    else setError(r.status === 404 ? 'Персонаж не найден' : `Ошибка: ${r.error}`);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('gm:character.changed', (p) => {
    if (p.id === id) void load();
  });
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);

  const ack = (r: GmAck) => {
    if (!r.ok) setError(r.error === 'offline' ? 'Нет связи: действие не отправлено' : `Не получилось: ${r.error}`);
    else setError(null);
  };

  const meta = async (patch: Record<string, unknown>) => {
    const r = await api<GmCharacterView>('POST', `/api/gm/characters/${encodeURIComponent(id)}/meta`, patch);
    if (r.ok) setC(r.data);
    else setError(OWNER_ERRORS[r.error] ?? `Не сохранилось: ${r.error}`);
  };
  const power = async (patch: Record<string, unknown>) => {
    const r = await api<GmCharacterView>('POST', `/api/gm/characters/${encodeURIComponent(id)}/power`, patch);
    if (r.ok) setC(r.data);
    else setError(`Не сохранилось: ${r.error}`);
  };

  if (!c) return error ? <p className="error">{error}</p> : <p className="muted">Загрузка…</p>;

  return (
    <>
      <section className="card">
        <div className="row spread">
          <h2>{c.name}</h2>
          <Link viewTransition to="/gm/party" className="btn btn-ghost">
            Назад
          </Link>
        </div>
        <p className="small muted">
          {[c.kind === 'local' ? 'Местный' : c.origin, c.archLabel && c.kind === 'popadanets' ? `архетип: ${c.archLabel}` : '', c.seed ? `сид ${c.seed}` : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="grid2">
          <label className="field">
            <span>Игрок</span>
            <select value={c.ownerMemberId ?? ''} onChange={(e) => meta({ ownerMemberId: e.target.value || null })}>
              <option value="">никому</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <PowerBox c={c} onSave={power} />
          <ThemePick look={c.player.look} onPick={(k) => meta({ cardTheme: k })} />
        </div>
        {c.kind === 'local' && <SaveField label="Описание для игрока" value={c.publicBio} onSave={(v) => meta({ publicBio: v })} rows={3} maxLength={4000} />}
        <SaveField label="Заметки мастера" value={c.notes} onSave={(v) => meta({ notes: v })} rows={3} maxLength={20000} />
        {c.craft?.hook && (
          <p className="small">
            <b>Ремесло, крючок:</b> {c.craft.hook}
          </p>
        )}
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => setPreview((p) => !p)}>
            {preview ? 'Скрыть предпросмотр' : 'Как увидит игрок'}
          </button>
          <a className="btn btn-ghost" href={`/api/gm/characters/${encodeURIComponent(id)}/export`}>
            Экспорт JSON
          </a>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {preview && (
        <section className="card preview">
          <p className="small muted">Ровно то, что получит игрок.</p>
          <PlayerCard c={c.player} fx={false} />
        </section>
      )}

      <SheetPanel c={c} onChange={setC} />
      <SummaryPanel c={c} onChange={setC} />

      {c.slots.map((s) => (
        <GmSlot key={`${s.index}-${s.traitId}`} s={s}>
          <SlotControls characterId={c.id} s={s} onAck={ack} />
        </GmSlot>
      ))}

      {c.combos.length > 0 && (
        <section className="card">
          <h3>Сочетания</h3>
          {c.combos.map((x, i) => (
            <p key={i}>{x.text}</p>
          ))}
        </section>
      )}
      {c.slots.some((s) => s.cat === 'green') && (
        <section className="card">
          <p className="small">{c.greenSigns}</p>
        </section>
      )}
    </>
  );
}

function PowerBox({ c, onSave }: { c: GmCharacterView; onSave: (p: Record<string, unknown>) => Promise<void> }) {
  const [v, setV] = useState(String(c.power.value));
  useEffect(() => setV(String(c.power.value)), [c.power.value]);
  const n = Math.trunc(Number(v));
  return (
    <div className="field">
      <span>Уровень силы · {c.power.band}</span>
      <div className="row">
        <input className="power-input" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} />
        {n > 0 && n !== c.power.value && (
          <button type="button" className="btn btn-secondary" onClick={() => onSave({ value: n })}>
            Сохранить
          </button>
        )}
      </div>
      <label className="check">
        <input type="checkbox" checked={c.power.show} onChange={(e) => onSave({ show: e.target.checked })} />
        Показывать игроку ступень силы
      </label>
    </div>
  );
}

function SlotControls({ characterId, s, onAck }: { characterId: string; s: GmSlotView; onAck: (r: GmAck) => void }) {
  const target = { characterId, slot: s.index };
  const [hint, setHint] = useState(s.revealed.hint);
  const [check, setCheck] = useState<HintCheck | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    setHint(s.revealed.hint);
    setCheck(null);
  }, [s.revealed.hint]);
  // Страж: перед сохранением подсказки спрашиваем Jev, не выдаёт ли она лишнего.
  const saveHint = async (force: boolean) => {
    if (!force && hint.trim()) {
      setChecking(true);
      const r = await api<HintCheck>('POST', `/api/gm/characters/${encodeURIComponent(characterId)}/hint-check`, { slot: s.index, hint });
      setChecking(false);
      const res: HintCheck = r.ok ? r.data : { status: 'unavailable', selfScore: null, others: [] };
      if (res.status === 'warn' || res.status === 'unavailable') return setCheck(res);
    }
    setCheck(null);
    await reveal({ hint });
  };
  const reveal = async (patch: Record<string, unknown>) => onAck(await emitGm('gm:trait.setReveal', { ...target, patch }));
  const stage = async (to: number) => onAck(await emitGm('gm:trait.setStage', { ...target, stage: to }));

  return (
    <div className="controls">
      <div className="stage-ctl">
        <button type="button" className="btn btn-ghost" disabled={s.stage <= 0} onClick={() => stage(s.stage - 1)} aria-label="Ступень назад">
          −
        </button>
        <span>
          Ступень: <b>{STAGES[s.stage]}</b>
        </span>
        <button type="button" className="btn btn-ghost" disabled={s.stage >= 4} onClick={() => stage(s.stage + 1)} aria-label="Ступень вперёд">
          +
        </button>
      </div>
      {s.stagePowerHint && <p className="small warn-text">{s.stagePowerHint}</p>}
      {s.stage === 4 && s.forkOptions && (
        <div className="fork">
          {(['a', 'b'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`btn ${s.fork === k ? '' : 'btn-secondary'}`}
              onClick={async () => onAck(await emitGm('gm:trait.setFork', { ...target, fork: k }))}
            >
              {s.forkOptions![k].title}
            </button>
          ))}
        </div>
      )}

      <fieldset className="reveal">
        <legend>
          Игрок видит:{' '}
          <b>{s.revealLevel === 'revealed' ? 'черту' : s.revealLevel === 'hinted' ? 'только подсказку' : 'ничего'}</b>
        </legend>
        <label className="check">
          <input type="checkbox" checked={s.revealed.trait} onChange={(e) => reveal({ trait: e.target.checked })} />
          Раскрыть черту
        </label>
        {s.revealed.trait && (
          <label className="field">
            <span>
              Показать ступеней: {s.revealed.stages} из {s.stage}
            </span>
            <input
              type="range"
              min={0}
              max={s.stage}
              value={s.revealed.stages}
              disabled={s.stage === 0}
              onChange={(e) => reveal({ stages: Number(e.target.value) })}
            />
          </label>
        )}
        {s.revealed.trait && s.price && (
          <label className="check">
            <input type="checkbox" checked={s.revealed.price} onChange={(e) => reveal({ price: e.target.checked })} />
            Показать цену
          </label>
        )}
        <label className="field">
          <span>Подсказка игроку</span>
          <textarea rows={2} maxLength={300} value={hint} onChange={(e) => setHint(e.target.value)} />
        </label>
        {hint !== s.revealed.hint && (
          <div className="row">
            <button type="button" className="btn btn-secondary" disabled={checking} onClick={() => saveHint(false)}>
              {checking ? 'Проверяю…' : 'Сохранить подсказку'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => (setHint(s.revealed.hint), setCheck(null))}>
              Отменить
            </button>
          </div>
        )}
        {check && (
          <div className="jev-warn">
            {check.status === 'unavailable' ? (
              <p>Проверка недоступна (Jev не ответил).</p>
            ) : (
              <>
                {check.selfScore !== null && check.selfScore >= 3 && (
                  <p>Подсказка почти раскрывает эту черту (оценка {check.selfScore.toFixed(1)} из 4).</p>
                )}
                {check.others.map((o) => (
                  <p key={o.traitName}>
                    Похоже, выдаёт другую скрытую черту «{o.traitName}» ({Math.round(o.probability * 100)}%).
                  </p>
                ))}
              </>
            )}
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => saveHint(true)}>
                Сохранить всё равно
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setCheck(null)}>
                Поправить
              </button>
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
