import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, m, MotionConfig } from 'motion/react';
import { DEMO_ROOM_CODE, EFFECT_LABELS, type TableState } from '@zg/shared';
import { ConnectionDot } from '../components/ConnectionDot.tsx';
import { api } from '../lib/api.ts';
import { useFeed } from '../lib/feed.ts';
import { homeFor, useMe } from '../lib/me.tsx';
import { connectSocket, useConnection, useSocketEvent } from '../lib/socket.ts';
import { load, save } from '../lib/storage.ts';
import { useWakeLock } from '../lib/wakeLock.ts';
import { ensureTheme } from '../lib/cardTheme/index.ts';
import { spring } from '../lib/motion.tsx';
import { cn } from '../lib/cn.ts';
import { capabilities } from '../lib/capabilities.ts';
import { TvScene } from '../tv/TvScene.tsx';
import { TvNpc } from '../tv/TvNpc.tsx';
import { TvMap } from '../tv/TvMap.tsx';
import { TvBigRoll } from '../tv/TvBigRoll.tsx';
import { TvParticles } from '../tv/TvParticles.tsx';
import { TvSigns, type Sign } from '../tv/TvSigns.tsx';
import { TV_VARS, effectColor, isTableRoll } from '../tv/palette.ts';

// Общий экран для ТВ и трансляции. Только публичное: сцена (без текста мастера), портрет противника (имя и картинка),
// публичные броски, признаки перегрузки. Палитра своя и постоянная: экран смотрят издалека, в тёмной комнате.

export function Table() {
  const { me, loading } = useMe();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!me) navigate('/login', { replace: true });
    else if (me.member.role !== 'table') navigate(homeFor(me.member.role), { replace: true });
  }, [loading, me, navigate]);
  if (!me || me.member.role !== 'table') return <div className="screen center muted">Загрузка…</div>;
  return <TableScreen room={me.room.name} demo={me.room.code === DEMO_ROOM_CODE} />;
}

function TableScreen({ room, demo }: { room: string; demo: boolean }) {
  useWakeLock();
  useEffect(() => ensureTheme('other'), []); // шрифты макета: Oranienbaum, IBM Plex
  const [state, setState] = useState<TableState>({ scene: null, npc: null, map: null });
  const [loaded, setLoaded] = useState(false); // до первого ответа заставку не показываем: иначе она мигнёт перед сценой
  const [signs, setSigns] = useState<Sign[]>([]);
  const [still, setStill] = useState(() => load('zg:table:still') === '1');
  // Облегчённый режим: ?lite=1, слабое устройство, нет WebGL2 или фон тормозит (кадр дольше 33 мс) — без 3D, частиц и наплыва.
  const [lite, setLite] = useState(() => capabilities.lite());
  const slow = useCallback(() => setLite(true), []);
  const rolls = useFeed().filter(isTableRoll).slice(0, 5);
  const [flying, setFlying] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const r = await api<TableState>('GET', '/api/table/state');
    if (r.ok) {
      setState(r.data);
      setLoaded(true);
    }
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
    // «Анимация выкл.» гасит всё движение Motion так же, как «Уменьшить движение» в системе.
    <MotionConfig reducedMotion={still ? 'always' : 'user'}>
      <div
        style={TV_VARS}
        data-still={still || undefined}
        className="tv fixed inset-0 overflow-hidden bg-[var(--tv-bg)] font-['IBM_Plex_Sans',system-ui,sans-serif] text-[var(--tv-ink)] [&_.conn]:text-[var(--tv-muted)]"
      >
        <TvScene scene={scene} motion={!still && !lite} idle={loaded && !state.npc} />
        {!still && !lite && !capabilities.reducedMotion() && <TvParticles onSlow={slow} />}
        <TvMap show={state.map} still={still} />

        <header className="absolute inset-x-[5vw] top-[3vh] flex items-center gap-4 text-[clamp(14px,1.1vw,22px)] opacity-70">
          <span className="grow tracking-[.08em] text-[var(--tv-muted)] uppercase">
            <span className="mr-3 text-[var(--tv-accent)]">◆</span>
            {room}
          </span>
          {lite && !still && <span className="text-[0.8em] text-[var(--tv-muted)]">облегчённый режим</span>}
          <ConnectionDot />
          <button
            type="button"
            onClick={toggleStill}
            aria-pressed={still}
            className="cursor-pointer rounded-full border border-solid border-[var(--tv-line)] bg-transparent px-4 py-1.5 font-[inherit] text-[0.8em] text-[var(--tv-ink)] hover:bg-white/10"
          >
            {still ? 'Анимация выкл.' : 'Анимация вкл.'}
          </button>
          {/* Стол не выходит никогда — кроме гостя демо-комнаты: ему надо сменить роль. */}
          {demo && (
            <button
              type="button"
              onClick={async () => {
                await api('POST', '/api/auth/logout');
                location.assign('/login');
              }}
              className="cursor-pointer rounded-full border border-solid border-[var(--tv-line)] bg-transparent px-4 py-1.5 font-[inherit] text-[0.8em] text-[var(--tv-ink)] hover:bg-white/10"
            >
              Выйти
            </button>
          )}
        </header>

        <TvNpc npc={state.npc} />
        <TvBigRoll filter={isTableRoll} three={!still && !lite} onFlying={setFlying} />

        <aside
          aria-label="Последние броски"
          aria-live="polite"
          className="absolute top-[11vh] right-[4vw] grid w-[min(22vw,400px)] min-w-[260px] gap-[1.4vh] portrait:top-[8vh] portrait:right-[5vw] portrait:left-[5vw] portrait:w-auto portrait:[&>div:nth-child(n+5)]:hidden"
        >
          {rolls.length > 0 && <span className="text-[clamp(14px,1.15vw,24px)] tracking-[.08em] text-[var(--tv-muted)] uppercase">Броски</span>}
          <AnimatePresence initial={false}>
            {rolls.map((r, i) => (
              <m.div
                key={r.id}
                layout="position"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={spring.soft}
                className={cn(
                  'grid grid-cols-[minmax(64px,25%)_1fr] items-center gap-4 rounded-[14px] bg-[var(--tv-card)] px-[1vw] py-[1.4vh]',
                  i === 0 ? 'border-2 border-solid border-[var(--tv-accent)]' : 'border border-solid border-[var(--tv-line)]',
                )}
              >
                {flying === r.id ? (
                  // число ещё катится на большом кубике: место держим, само число прилетит с плашки
                  <b aria-hidden="true" className="invisible text-center font-['IBM_Plex_Mono',monospace] text-[clamp(32px,2.7vw,56px)] leading-none font-medium">
                    {r.value}
                  </b>
                ) : (
                  <m.b layoutId={`tv-roll-${r.id}`} className="text-center font-['IBM_Plex_Mono',monospace] text-[clamp(32px,2.7vw,56px)] leading-none font-medium tabular-nums">
                    {r.value}
                  </m.b>
                )}
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate text-[clamp(16px,1.25vw,26px)]">
                    {r.character ?? r.who} <span className="text-[var(--tv-muted)]">· {r.kind}</span>
                  </span>
                  <span className={cn('text-[clamp(15px,1.15vw,24px)] font-semibold', flying === r.id ? 'text-[var(--tv-muted)]' : effectColor(r.effect))}>
                    {flying === r.id ? 'бросает…' : EFFECT_LABELS[r.effect]}
                  </span>
                </div>
              </m.div>
            ))}
          </AnimatePresence>
        </aside>

        <TvSigns signs={signs} />
      </div>
    </MotionConfig>
  );
}
