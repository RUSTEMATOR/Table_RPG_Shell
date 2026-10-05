import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, m, MotionConfig } from 'motion/react';
import { EFFECT_LABELS, SIGN_TEXT, type OverloadSign, type TableState } from '@zg/shared';
import { ConnectionDot } from '../components/ConnectionDot.tsx';
import { api } from '../lib/api.ts';
import { useFeed, type FeedRoll } from '../lib/feed.ts';
import { homeFor, useMe } from '../lib/me.tsx';
import { connectSocket, useConnection, useSocketEvent } from '../lib/socket.ts';
import { load, save } from '../lib/storage.ts';
import { useWakeLock } from '../lib/wakeLock.ts';
import { ensureTheme } from '../lib/cardTheme/index.ts';
import { spring } from '../lib/motion.tsx';
import { cn } from '../lib/cn.ts';
import { capabilities } from '../lib/capabilities.ts';
import { TvScene } from '../tv/TvScene.tsx';

// Общий экран для ТВ и трансляции. Только публичное: сцена (без текста мастера), портрет противника (имя и картинка),
// публичные броски, признаки перегрузки. Палитра своя и постоянная: экран смотрят издалека, в тёмной комнате.

/** Палитра стола (макет «Стол · бросок»). Не зависит от тем игроков и «Дня/Ночи». */
const TV_VARS = {
  '--tv-bg': '#0d0f0d',
  '--tv-ink': '#f5f7f2',
  '--tv-soft': '#dfe6dc',
  '--tv-muted': '#c2cbbf',
  '--tv-line': '#3a463c',
  '--tv-card': '#161a16',
  '--tv-accent': '#6fe0a6',
  '--tv-ok': '#8ef0b0',
  '--tv-bad': '#ff8b8b',
  '--tv-warn': '#f0c46f',
} as CSSProperties;

const OK = new Set(['crit', 'crit_damage', 'strong', 'success', 'luck']);
const BAD = new Set(['complication', 'notable_damage', 'fail']);
export const effectColor = (e: string) =>
  e === 'scratch' ? 'text-[var(--tv-warn)]' : OK.has(e) ? 'text-[var(--tv-ok)]' : BAD.has(e) ? 'text-[var(--tv-bad)]' : 'text-[var(--tv-muted)]';
export const isTableRoll = (r: FeedRoll) => !('memberId' in r) && !r.private;

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
  useEffect(() => ensureTheme('other'), []); // шрифты макета: Oranienbaum, IBM Plex
  const [state, setState] = useState<TableState>({ scene: null, npc: null });
  const [loaded, setLoaded] = useState(false); // до первого ответа заставку не показываем: иначе она мигнёт перед сценой
  const [signs, setSigns] = useState<Sign[]>([]);
  const [still, setStill] = useState(() => load('zg:table:still') === '1');
  // Облегчённый режим: ?lite=1, слабое устройство или нет WebGL2 (этап 20, шаг 5 добавит замер кадров).
  const [lite] = useState(() => capabilities.lite());
  const rolls = useFeed().filter(isTableRoll).slice(0, 5);

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

        <header className="absolute inset-x-[5vw] top-[3vh] flex items-center gap-4 text-[clamp(14px,1.1vw,22px)] opacity-70">
          <span className="grow tracking-[.08em] text-[var(--tv-muted)] uppercase">
            <span className="mr-3 text-[var(--tv-accent)]">◆</span>
            {room}
          </span>
          <ConnectionDot />
          <button
            type="button"
            onClick={toggleStill}
            aria-pressed={still}
            className="cursor-pointer rounded-full border border-solid border-[var(--tv-line)] bg-transparent px-4 py-1.5 font-[inherit] text-[0.8em] text-[var(--tv-ink)] hover:bg-white/10"
          >
            {still ? 'Анимация выкл.' : 'Анимация вкл.'}
          </button>
        </header>

        {state.npc && (
          <figure className="absolute top-[14vh] left-[5vw] m-0 grid w-[min(28vw,520px)] gap-3">
            {state.npc.image && (
              <img
                src={state.npc.image.url}
                alt=""
                width={state.npc.image.w}
                height={state.npc.image.h}
                className="aspect-[4/5] w-full rounded-[14px] object-cover shadow-[0_30px_60px_rgba(0,0,0,.5)]"
              />
            )}
            <figcaption className="font-['Oranienbaum',Georgia,serif] text-[clamp(32px,3.4vw,72px)] leading-none [text-shadow:0_2px_24px_rgba(0,0,0,.6)]">
              {state.npc.name}
            </figcaption>
          </figure>
        )}

        <aside aria-label="Последние броски" aria-live="polite" className="absolute top-[11vh] right-[4vw] grid w-[min(22vw,400px)] min-w-[260px] gap-[1.4vh]">
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
                <b className="text-center font-['IBM_Plex_Mono',monospace] text-[clamp(32px,2.7vw,56px)] leading-none font-medium tabular-nums">{r.value}</b>
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate text-[clamp(16px,1.25vw,26px)]">
                    {r.character ?? r.who} <span className="text-[var(--tv-muted)]">· {r.kind}</span>
                  </span>
                  <span className={cn('text-[clamp(15px,1.15vw,24px)] font-semibold', effectColor(r.effect))}>{EFFECT_LABELS[r.effect]}</span>
                </div>
              </m.div>
            ))}
          </AnimatePresence>
        </aside>

        {signs.length > 0 && (
          <div className="absolute right-[4vw] bottom-[7vh] grid justify-items-end gap-2">
            {signs.map((s) => (
              <div key={s.at} className={`tv-sign sign-${s.sign}`}>
                {s.character}: {SIGN_TEXT[s.sign]}
              </div>
            ))}
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
