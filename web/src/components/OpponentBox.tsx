import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { GmNpc, GmSessionView } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';
import { toast } from '../ui/index.ts';

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Противник сессии: его сила учитывается в бросках игроков. Игроки его не видят. */
export function OpponentBox() {
  const [s, setS] = useState<GmSessionView | null>(null);
  const [name, setName] = useState('');
  const [power, setPower] = useState('');
  const load = useCallback(async () => {
    const r = await api<GmSessionView>('GET', '/api/gm/session');
    if (r.ok) {
      setS(r.data);
      setName(r.data.opponentName);
      setPower(r.data.opponentPower ? String(r.data.opponentPower) : '');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('gm:session.changed', () => void load());
  const [npcs, setNpcs] = useState<GmNpc[]>([]);
  const loadNpcs = useCallback(async () => {
    const r = await api<GmNpc[]>('GET', '/api/gm/npcs');
    if (r.ok) setNpcs(r.data);
  }, []);
  useEffect(() => {
    void loadNpcs();
  }, [loadNpcs]);
  useSocketEvent('gm:npcs.changed', () => void loadNpcs());
  const pick = async (npcId: string) => {
    if (!npcId) return;
    const r = await api<GmSessionView>('POST', '/api/gm/session/opponent', { name: '', power: null, npcId });
    if (r.ok) {
      setS(r.data);
      setName(r.data.opponentName);
      setPower(r.data.opponentPower ? String(r.data.opponentPower) : '');
      toast(`Противник сессии: ${r.data.opponentName}`);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const p = Math.trunc(Number(power));
    const r = await api<GmSessionView>('POST', '/api/gm/session/opponent', { name, power: p > 0 ? p : null });
    if (r.ok) {
      setS(r.data);
      toast('Противник задан');
    }
  };
  const [confirmNew, setConfirmNew] = useState(false);
  const startNew = async () => {
    if (!confirmNew) return setConfirmNew(true);
    setConfirmNew(false);
    const r = await api<GmSessionView>('POST', '/api/gm/session/new');
    if (r.ok) {
      toast('Новая сессия начата');
      setS(r.data);
      setName('');
      setPower('');
    }
  };
  const clear = async () => {
    const r = await api<GmSessionView>('POST', '/api/gm/session/opponent', { name: '', power: null });
    if (r.ok) {
      setS(r.data);
      setName('');
      setPower('');
    }
  };

  return (
    <form onSubmit={save} className="stack">
      {s && (
        <div className="row spread">
          <span className="small muted">Сессия с {when(s.startedAt)}</span>
          <button type="button" className="btn btn-ghost" onClick={startNew} onBlur={() => setConfirmNew(false)}>
            {confirmNew ? 'Точно начать новую?' : 'Начать новую сессию'}
          </button>
        </div>
      )}
      {npcs.length > 0 && (
        <label className="field">
          <span>Из библиотеки</span>
          <select value={s?.opponentNpcId ?? ''} onChange={(e) => void pick(e.target.value)}>
            <option value="">{s?.opponentNpcId ? 'не из библиотеки' : 'выбрать…'}</option>
            {npcs.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
                {n.power ? ` · ${n.power} (${n.band})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid2">
        <label className="field">
          <span>Противник</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="например, Тролль" />
        </label>
        <label className="field">
          <span>Его уровень силы{s?.opponentBand ? ` · ${s.opponentBand}` : ''}</span>
          <input value={power} inputMode="numeric" onChange={(e) => setPower(e.target.value.replace(/\D/g, ''))} placeholder="пусто — без противника" />
        </label>
      </div>
      <div className="row">
        <button className="btn btn-secondary">Задать</button>
        {s?.opponentPower && (
          <button type="button" className="btn btn-ghost" onClick={clear}>
            Убрать противника
          </button>
        )}
      </div>
      <p className="small muted">
        {s?.opponentPower
          ? `Сейчас броски игроков идут против силы ${s.opponentPower}.`
          : 'Противник не задан: d10 игроков без поправки на силу.'}
      </p>
    </form>
  );
}
