import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { Figure, GmNpc } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { AnimatePresence, m } from 'motion/react';
import { spring } from '../lib/motion.tsx';
import { cn } from '../lib/cn.ts';
import { Badge, Button, buttonVariants, Card, CardTitle, Field, Input, Sheet, Textarea, toast } from '../ui/index.ts';

// Фигурки — отдельный чанк (каталог деталей LPC и сборка листов), грузится, только если есть что показать.
const FigureEditor = lazy(() => import('../figure/FigureEditor.tsx').then((m) => ({ default: m.FigureEditor })));
const FigureSprite = lazy(() => import('../figure/FigureSprite.tsx').then((m) => ({ default: m.FigureSprite })));

export function GmNpcs() {
  return <Npcs />;
}

/** Библиотека противников: заранее заведённые NPC, противник сессии одним нажатием, портрет на стол. */
function Npcs() {
  const [list, setList] = useState<GmNpc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<GmNpc[]>('GET', '/api/gm/npcs');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:npcs.changed', () => void load());

  const create = async () => {
    const r = await api<GmNpc>('POST', '/api/gm/npcs', { name: 'Новый противник', power: null, notes: '' });
    if (r.ok) setList((l) => [r.data, ...(l ?? [])]);
    else setError('Не создалось');
  };
  const hide = async () => {
    const r = await api('POST', '/api/gm/table/npc', { npcId: null });
    if (r.ok) toast('Противник убран со стола');
  };
  const anyShown = list?.some((n) => n.shown);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="grow">Противники</CardTitle>
          {anyShown && (
            <Button variant="ghost" onClick={hide}>
              Убрать портрет со стола
            </Button>
          )}
          <Button variant="primary" onClick={create}>
            Новый
          </Button>
        </div>
        <p className="m-0 text-[13.6px] text-muted">Игроки противников не видят. На стол по кнопке уходят только имя и портрет; сила и заметки остаются здесь.</p>
        {list?.length === 0 && <p className="m-0 text-muted">Пока никого.</p>}
        {error && <p className="error m-0">{error}</p>}
      </Card>
      <AnimatePresence initial={false}>
        {list?.map((n) => (
          <m.div key={n.id} layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={spring.soft}>
            <NpcEditor n={n} onChange={(x) => setList((l) => (l ?? []).map((y) => (y.id === x.id ? x : y)))} />
          </m.div>
        ))}
      </AnimatePresence>
    </>
  );
}

function NpcEditor({ n, onChange }: { n: GmNpc; onChange: (n: GmNpc) => void }) {
  const [name, setName] = useState(n.name);
  const [power, setPower] = useState(n.power ? String(n.power) : '');
  const [notes, setNotes] = useState(n.notes);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [figureOpen, setFigureOpen] = useState(false);
  useEffect(() => {
    setName(n.name);
    setPower(n.power ? String(n.power) : '');
    setNotes(n.notes);
  }, [n.name, n.power, n.notes]);
  const p = Math.trunc(Number(power));
  const powerValue = p > 0 ? p : null;
  const dirty = name !== n.name || powerValue !== n.power || notes !== n.notes;

  const save = async () => {
    setBusy(true);
    const r = await api<GmNpc>('POST', `/api/gm/npcs/${n.id}`, { name, power: powerValue, notes });
    setBusy(false);
    if (r.ok) onChange(r.data);
    else setMsg('Не сохранилось');
    return r.ok;
  };
  const makeOpponent = async () => {
    if (dirty && !(await save())) return;
    const r = await api('POST', '/api/gm/session/opponent', { name: '', power: null, npcId: n.id });
    if (!r.ok) setMsg('Не получилось');
    else toast(`«${name}» — противник сессии`);
  };
  const show = async (on: boolean) => {
    if (on && dirty && !(await save())) return;
    const r = await api('POST', '/api/gm/table/npc', { npcId: on ? n.id : null });
    if (r.ok) toast(on ? `«${name}» на столе` : 'Противник убран со стола');
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg('Загружаю…');
    let res: Response;
    try {
      res = await fetch(`/api/gm/npcs/${n.id}/image`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': file.type || 'image/jpeg' },
        body: file,
      });
    } catch {
      setBusy(false);
      return setMsg('Нет связи');
    }
    setBusy(false);
    if (!res.ok) return setMsg('Картинка не подошла');
    onChange((await res.json()) as GmNpc);
    setMsg(null);
  };
  const figure = async (f: Figure | null) => {
    const r = await api<GmNpc>('POST', `/api/gm/npcs/${n.id}/figure`, f);
    if (!r.ok) {
      toast.error('Фигурка не сохранилась');
      return false;
    }
    onChange(r.data);
    toast(f ? 'Фигурка сохранена' : 'Фигурка убрана');
    if (!f) setFigureOpen(false);
    return true;
  };
  const remove = async () => {
    if (!confirmDel) return setConfirmDel(true);
    await api('POST', `/api/gm/npcs/${n.id}/delete`);
  };

  return (
    <Card className={cn((n.shown || n.opponent) && 'outline-2 outline-offset-[-2px] outline-accent')}>
      {(n.opponent || n.shown) && (
        <div className="flex gap-2">
          {n.opponent && <Badge tone="accent">Противник сессии</Badge>}
          {n.shown && <Badge tone="ok">Портрет на столе</Badge>}
        </div>
      )}
      <div className="grid items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="grid justify-items-start gap-2">
          <div className="grid size-28 place-items-center overflow-hidden rounded-card border border-solid border-border bg-surface-2 text-muted">
            {n.image ? (
              <img src={n.image.url} alt="" width={n.image.w} height={n.image.h} loading="lazy" className="size-full object-cover" />
            ) : (
              <span className="text-xs">без портрета</span>
            )}
          </div>
          <label className={cn(buttonVariants({ size: 'sm' }), busy && 'pointer-events-none opacity-50')}>
            {n.image ? 'Заменить' : 'Портрет'}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
          </label>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setFigureOpen(true)}>
            {n.figure && (
              <Suspense fallback={null}>
                <FigureSprite figure={n.figure} size={32} paused className="-my-1" />
              </Suspense>
            )}
            {n.figure ? 'Фигурка' : '+ Фигурка'}
          </Button>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <Field label="Имя">{(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="font-name text-lg" />}</Field>
            <Field label={`Уровень силы${n.band ? ` · ${n.band}` : ''}`}>
              {(id) => (
                <Input
                  id={id}
                  value={power}
                  inputMode="numeric"
                  onChange={(e) => setPower(e.target.value.replace(/\D/g, ''))}
                  placeholder="не задан"
                  className="font-mono tabular-nums"
                />
              )}
            </Field>
          </div>
          <Field label="Заметки мастера (никуда не уходят)">
            {(id) => <Textarea id={id} rows={3} value={notes} maxLength={20000} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!n.opponent && (
          <Button variant="primary" disabled={busy} onClick={makeOpponent}>
            Сделать противником
          </Button>
        )}
        <Button disabled={busy} onClick={() => show(!n.shown)}>
          {n.shown ? 'Убрать со стола' : 'Показать на столе'}
        </Button>
        {dirty && (
          <Button disabled={busy} onClick={async () => (await save()) && toast('Противник сохранён')}>
            Сохранить
          </Button>
        )}
        <Button variant={confirmDel ? 'danger' : 'ghost'} className="ml-auto" disabled={busy} onClick={remove} onBlur={() => setConfirmDel(false)}>
          {confirmDel ? 'Точно удалить?' : 'Удалить'}
        </Button>
      </div>
      {msg && <p className="m-0 text-[13.6px] text-muted">{msg}</p>}
      <Sheet open={figureOpen} onOpenChange={setFigureOpen} title={`Фигурка · ${n.name || 'противник'}`}>
        <Suspense fallback={<p className="muted">Загрузка…</p>}>
          <FigureEditor
            creatures
            value={n.figure}
            onSave={figure}
            onClear={() => figure(null)}
            note="Фигурку увидят игроки и стол, когда противник окажется на карте или в бою. Сила и заметки остаются у мастера."
          />
        </Suspense>
      </Sheet>
    </Card>
  );
}
