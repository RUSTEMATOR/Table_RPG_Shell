import { useCallback, useEffect, useState } from 'react';
import { EFFECT_LABELS, SIGN_TEXT, type OverloadSign, type TableState } from '@zg/shared';
import { ConnectionDot } from '../components/ConnectionDot.tsx';
import { api } from '../lib/api.ts';
import { useFeed } from '../lib/feed.ts';
import { homeFor, useMe } from '../lib/me.tsx';
import { connectSocket, useConnection, useSocketEvent } from '../lib/socket.ts';
import { load, save } from '../lib/storage.ts';
import { useWakeLock } from '../lib/wakeLock.ts';
import { useNavigate } from 'react-router';

// Общий экран для ТВ и трансляции. Только публичное: сцена (без текста мастера), публичные броски, признаки перегрузки.

export function Table() {
  const { me, loading } = useMe();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!me) navigate('/login', { replace: true });
    else if (me.member.role !== 'table') navigate(homeFor(me.member.role), { replace: true });
  }, [loading, me, navigate]);
  if (!me || me.member.role !== 'table') return <div className="screen center muted">Загрузка…</div>;
  return <TableScreen room={me.room.name} />;
}

interface Sign {
  character: string;
  sign: OverloadSign;
  at: number;
}

function TableScreen({ room }: { room: string }) {
  useWakeLock();
  const [state, setState] = useState<TableState>({ scene: null });
  const [signs, setSigns] = useState<Sign[]>([]);
  const [still, setStill] = useState(() => load('zg:table:still') === '1');
  const rolls = useFeed()
    .filter((r) => !('memberId' in r) && !r.private)
    .slice(0, 5);

  const loadState = useCallback(async () => {
    const r = await api<TableState>('GET', '/api/table/state');
    if (r.ok) setState(r.data);
  }, []);
  useEffect(() => {
    connectSocket();
    void loadState();
  }, [loadState]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void loadState();
  }, [conn, loadState]);
  useSocketEvent('table:state', (s) => setState(s));
  useSocketEvent('table:sign', (s) => {
    setSigns((l) => [s, ...l.filter((x) => x.character !== s.character)].slice(0, 4));
    window.setTimeout(() => setSigns((l) => l.filter((x) => x.at !== s.at)), 12000);
  });

  const toggleStill = () => {
    setStill((v) => {
      save('zg:table:still', v ? '0' : '1');
      return !v;
    });
  };

  const scene = state.scene;
  return (
    <div className={`table ${still ? 'table-still' : ''}`}>
      {scene?.image && <img className="table-art" src={scene.image.url} alt="" width={scene.image.w} height={scene.image.h} />}
      <div className="table-overlay">
        <header className="table-top">
          <span className="table-room">{room}</span>
          <ConnectionDot />
          <button type="button" className="btn btn-ghost table-btn" onClick={toggleStill} aria-pressed={still}>
            {still ? 'Анимация выкл.' : 'Анимация вкл.'}
          </button>
        </header>
        <main className="table-main">
          <section className="table-scene">
            {scene ? (
              <>
                {scene.title && <h1 className="table-title">{scene.title}</h1>}
                {scene.text && <p className="table-text">{scene.text}</p>}
              </>
            ) : (
              <p className="table-title muted">Зеленогорье</p>
            )}
          </section>
          <aside className="table-rolls" aria-live="polite">
            {rolls.map((r, i) => (
              <div key={r.id} className={`table-roll ${i === 0 ? 'table-roll-new' : ''}`}>
                <span className="table-roll-value">{r.value}</span>
                <div>
                  <div className="table-roll-who">
                    {r.character ?? r.who} · {r.kind}
                  </div>
                  <div className={`table-roll-effect effect-${r.effect}`}>{EFFECT_LABELS[r.effect]}</div>
                </div>
              </div>
            ))}
          </aside>
        </main>
        {signs.length > 0 && (
          <div className="table-signs">
            {signs.map((s) => (
              <div key={s.at} className={`table-sign sign-${s.sign}`}>
                {s.character}: {SIGN_TEXT[s.sign]}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
