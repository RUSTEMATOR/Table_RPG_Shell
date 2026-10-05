import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { GmSessionView } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';

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

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const p = Math.trunc(Number(power));
    const r = await api<GmSessionView>('POST', '/api/gm/session/opponent', { name, power: p > 0 ? p : null });
    if (r.ok) setS(r.data);
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
