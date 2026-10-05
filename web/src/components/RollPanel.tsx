import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent } from 'react';
import { EFFECT_LABELS } from '@zg/shared';
import { addOwn, holdOwn, type FeedRoll } from '../lib/feed.ts';
import { useMe } from '../lib/me.tsx';
import { requestRoll } from '../lib/socket.ts';
import { capabilities, fullEffects } from '../lib/capabilities.ts';
import { haptics } from '../lib/haptics.ts';
import { simulateThrow, warmPhysics } from '../dice/physics.ts';
import type { StageRoll } from '../dice/DiceStage.tsx';
import { Button, Card, Input, Segmented } from '../ui/index.ts';
import { cn } from '../lib/cn.ts';

const DiceStage = lazy(() => import('../dice/DiceStage.tsx'));

type Kind = 'd10' | 'd20';
const OK = new Set(['crit', 'crit_damage', 'strong', 'success', 'luck']);
const BAD = new Set(['complication', 'notable_damage', 'fail']);

function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function effectTone(effect: string): string {
  return effect === 'scratch' ? 'text-warn' : OK.has(effect) ? 'text-ok' : BAD.has(effect) ? 'text-danger' : 'text-muted';
}

/**
 * Панель броска с 3D-лотком. Результат всегда с сервера: физика просчитывается сразу при нажатии,
 * кубик встряхивается до ответа и ложится числом сервера вверх (dice/symmetry.ts). От нажатия до числа — до 1,2 с.
 * Без WebGL2, при «уменьшить движение» или в облегчённом режиме — просто число.
 */
export function RollPanel({ role }: { role: 'gm' | 'player' }) {
  const options =
    role === 'gm'
      ? [
          { value: 'public', label: 'Всем' },
          { value: 'gm_hidden', label: 'Скрытый' },
        ]
      : [
          { value: 'public', label: 'Всем' },
          { value: 'gm_and_me', label: 'Мне и мастеру' },
        ];
  const [three, setThree] = useState(() => fullEffects() && capabilities.webgl2());
  const [kind, setKind] = useState<Kind>('d20');
  const [visibility, setVisibility] = useState('public');
  const [label, setLabel] = useState('');
  const [pending, setPending] = useState<{ id: string; kind: Kind } | null>(null);
  const [stage, setStage] = useState<StageRoll>({ key: '', kind: 'd20', traj: null, value: null });
  const [shown, setShown] = useState<FeedRoll | null>(null);
  const [spin, setSpin] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const landed = useRef<{ id: string; roll: FeedRoll } | null>(null);
  const { me } = useMe();
  const release = useRef<(() => void) | null>(null);
  const unhold = () => {
    release.current?.();
    release.current = null;
  };
  useEffect(() => unhold, []);
  const spinTimer = useRef<number | null>(null);

  useEffect(() => {
    if (three) warmPhysics();
  }, [three]);
  useEffect(() => () => void (spinTimer.current && window.clearInterval(spinTimer.current)), []);

  const finish = (roll: FeedRoll) => {
    addOwn(roll);
    unhold();
    setShown(roll);
    setPending(null);
    setLabel('');
    if (roll.effect === 'crit' || roll.effect === 'crit_damage') haptics.crit();
    else if (BAD.has(roll.effect)) haptics.fail();
    else haptics.success();
  };

  const send = async (k: Kind, id: string, angle?: number, power?: number) => {
    haptics.tap();
    setPending({ id, kind: k });
    setError(null);
    setShown(null);
    unhold();
    if (me) release.current = holdOwn(me.member.name, k);
    const sides = k === 'd10' ? 10 : 20;
    const physics = three ? simulateThrow(k, angle, power) : Promise.resolve(null);
    if (three) setStage({ key: id, kind: k, traj: null, value: null });
    else if (!capabilities.reducedMotion()) {
      if (spinTimer.current) window.clearInterval(spinTimer.current);
      spinTimer.current = window.setInterval(() => setSpin(1 + Math.floor(Math.random() * sides)), 70);
    }
    const started = Date.now();
    const res = await requestRoll({ clientRequestId: id, kind: k, visibility, label: label.trim() });
    if (!res.ok) {
      unhold();
      if (spinTimer.current) window.clearInterval(spinTimer.current);
      setSpin(null);
      if (three) setStage((s) => ({ ...s, key: '' }));
      // pending остаётся: «Повторить» отправит тот же id, сервер не бросит дважды.
      setError(res.error === 'timeout' ? 'Нет ответа от сервера.' : `Не получилось: ${res.error}`);
      return;
    }
    if (!three) {
      window.setTimeout(
        () => {
          if (spinTimer.current) window.clearInterval(spinTimer.current);
          setSpin(null);
          finish(res.roll);
        },
        capabilities.reducedMotion() ? 0 : Math.max(0, 700 - (Date.now() - started)),
      );
      return;
    }
    landed.current = { id, roll: res.roll };
    setStage((s) => (s.key === id ? { ...s, value: res.roll.value } : s));
    // Физика обычно готова раньше сервера; если нет за 0,6 с — показываем число без 3D.
    const traj = await Promise.race([physics, new Promise<null>((r) => window.setTimeout(() => r(null), 600))]);
    if (traj) setStage((s) => (s.key === id ? { ...s, traj } : s));
    else {
      setStage((s) => ({ ...s, key: '' }));
      finish(res.roll);
    }
  };

  const onLanded = () => {
    const l = landed.current;
    landed.current = null;
    if (l) finish(l.roll);
  };

  // Щелчок по лотку: направление и сила броска.
  const flick = useRef<{ x: number; y: number; t: number } | null>(null);
  const onDown = (e: PointerEvent) => (flick.current = { x: e.clientX, y: e.clientY, t: performance.now() });
  const onUp = (e: PointerEvent) => {
    const f = flick.current;
    flick.current = null;
    if (!f || busy) return;
    const dx = e.clientX - f.x, dy = e.clientY - f.y, dist = Math.hypot(dx, dy);
    if (dist < 24) return;
    const speed = dist / Math.max(40, performance.now() - f.t);
    send(kind, newRequestId(), Math.atan2(-dy, -dx), Math.min(1, speed / 2.5));
  };

  const busy = pending !== null && error === null;
  const trayH = role === 'gm' ? 'h-[220px]' : 'h-[clamp(240px,46dvh,380px)]';

  return (
    <Card className="roll-panel gap-3">
      <div
        className={cn('relative overflow-hidden rounded-sheet border border-solid border-border bg-surface-2 select-none', trayH, three && 'touch-none')}
        onPointerDown={three ? onDown : undefined}
        onPointerUp={three ? onUp : undefined}
      >
        {three && (
          <Suspense fallback={null}>
            <DiceStage
              className="!absolute inset-0"
              roll={stage}
              onImpact={(s) => haptics.bump(s)}
              onLanded={onLanded}
              onLost={() => {
                setThree(false);
                const l = landed.current;
                landed.current = null;
                if (l) finish(l.roll);
              }}
            />
          </Suspense>
        )}
        {three && !busy && !shown && <span className="pointer-events-none absolute top-3 left-4 font-ui text-xs tracking-[.06em] text-muted uppercase">Смахни по лотку, чтобы бросить</span>}
        <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          {spin !== null && <span className="font-mono text-5xl font-medium tabular-nums text-muted">{spin}</span>}
          {spin === null && shown && (
            <span className="flex items-baseline gap-3 rounded-full border border-solid border-border bg-surface px-5 py-1.5 shadow-card">
              <b className="font-mono text-3xl font-medium tabular-nums">{shown.value}</b>
              <span className={cn('font-ui text-base font-semibold', effectTone(shown.effect))}>{EFFECT_LABELS[shown.effect]}</span>
            </span>
          )}
          {!three && spin === null && !shown && !busy && <span className="font-ui text-sm text-muted">Выбери кубик и бросай</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented label="Кубик" value={kind} onChange={setKind} options={[{ value: 'd10', label: 'd10' }, { value: 'd20', label: 'd20' }]} />
        <Segmented label="Кто видит" value={visibility} onChange={setVisibility} options={options} />
      </div>
      <Input
        className="roll-label"
        aria-label="Подпись к броску"
        placeholder={role === 'gm' ? 'Кто или что бросает (необязательно)' : 'Что делаю (необязательно)'}
        value={label}
        maxLength={300}
        onChange={(e) => setLabel(e.target.value)}
        disabled={busy}
      />
      <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={() => send(kind, newRequestId())}>
        {busy ? 'Бросаю…' : `Бросить ${kind}`}
      </Button>

      {error && pending && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="error m-0 grow">{error}</p>
          <Button onClick={() => send(pending.kind, pending.id)}>Повторить</Button>
          <Button variant="ghost" onClick={() => (setPending(null), setError(null))}>
            Отмена
          </Button>
        </div>
      )}
    </Card>
  );
}
