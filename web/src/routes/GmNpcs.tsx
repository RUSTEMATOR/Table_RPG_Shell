import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ATTITUDE_LABELS, UNIT_IDS, type Figure, type GmNpc, type SrdListItem, type UnitId } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { AnimatePresence, m } from 'motion/react';
import { spring } from '../lib/motion.tsx';
import { cn } from '../lib/cn.ts';
import { Badge, Button, buttonVariants, Card, CardTitle, Field, Input, Select, Sheet, Textarea, toast, Switch } from '../ui/index.ts';
import units from '../maps3d/units.json';
import { Pic } from '../components/Pic.tsx';
import { uploadImage } from '../lib/uploadImage.ts';

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
  const [srdOpen, setSrdOpen] = useState(false);

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
          <Button variant="ghost" onClick={() => setSrdOpen(true)}>
            Из бестиария D&D
          </Button>
          <Button variant="primary" onClick={create}>
            Новый
          </Button>
        </div>
        <SrdPicker open={srdOpen} onClose={() => setSrdOpen(false)} onAdded={(n) => setList((l) => [n, ...(l ?? [])])} />
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

/** Справочник D&D SRD (этап 50, шаг 5): поиск по имени и виду, «Добавить» — противник с флагом бестиария и силой по CR. */
function SrdPicker({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (n: GmNpc) => void }) {
  const [list, setList] = useState<SrdListItem[] | null>(null);
  const [attribution, setAttribution] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!open || list) return;
    void api<{ attribution: string; monsters: SrdListItem[] }>('GET', '/api/gm/bestiary-srd').then((r) => {
      if (r.ok) {
        setList(r.data.monsters);
        setAttribution(r.data.attribution);
      }
    });
  }, [open, list]);
  const needle = q.trim().toLowerCase();
  const shown = (list ?? []).filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.type.toLowerCase().includes(needle) || m.cr === needle).slice(0, 60);
  const add = async (m: SrdListItem) => {
    setBusy(m.slug);
    const r = await api<GmNpc>('POST', '/api/gm/npcs/from-srd', { slug: m.slug });
    setBusy(null);
    if (!r.ok) return toast.error('Не добавилось');
    onAdded(r.data);
    toast(`«${m.name}» добавлен: сила ${m.power}, статблок в заметках`);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Бестиарий D&D SRD"
      description="322 чудища из SRD 5.1 (CC-BY-4.0). Добавленный противник получает флаг «В бестиарии», силу по CR и статблок в заметках мастера; имя — английское, переименуйте по вкусу."
    >
      <div className="grid gap-3">
        <Input aria-label="Поиск" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, вид (dragon, undead, beast…) или CR" autoFocus />
        {list === null && <p className="m-0 text-muted">Загрузка…</p>}
        <ul className="m-0 grid max-h-[55dvh] list-none gap-0 overflow-y-auto p-0">
          {shown.map((m) => (
            <li key={m.slug} className="flex items-center gap-2 border-b border-solid border-border py-2 last:border-0">
              <span className="grid min-w-0 grow">
                <b className="truncate">{m.name}</b>
                <span className="truncate text-[12.5px] text-muted">
                  {m.size} {m.type} · CR {m.cr} · сила {m.power} ({m.band})
                </span>
              </span>
              <Button size="sm" disabled={busy !== null} onClick={() => void add(m)}>
                {busy === m.slug ? '…' : 'Добавить'}
              </Button>
            </li>
          ))}
          {list && shown.length === 0 && <li className="py-2 text-muted">Ничего не нашлось.</li>}
        </ul>
        {attribution && <p className="m-0 text-[11.5px] leading-snug text-muted">{attribution}</p>}
      </div>
    </Sheet>
  );
}

function NpcEditor({ n, onChange }: { n: GmNpc; onChange: (n: GmNpc) => void }) {
  const [name, setName] = useState(n.name);
  const [power, setPower] = useState(n.power ? String(n.power) : '');
  const [notes, setNotes] = useState(n.notes);
  const [beast, setBeast] = useState(n.bestiary);
  const [beastText, setBeastText] = useState(n.bestiaryText);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [figureOpen, setFigureOpen] = useState(false);
  useEffect(() => {
    setName(n.name);
    setPower(n.power ? String(n.power) : '');
    setNotes(n.notes);
    setBeast(n.bestiary);
    setBeastText(n.bestiaryText);
  }, [n.name, n.power, n.notes, n.bestiary, n.bestiaryText]);
  const p = Math.trunc(Number(power));
  const powerValue = p > 0 ? p : null;
  const dirty = name !== n.name || powerValue !== n.power || notes !== n.notes || beast !== n.bestiary || beastText !== n.bestiaryText;

  const save = async () => {
    setBusy(true);
    const r = await api<GmNpc>('POST', `/api/gm/npcs/${n.id}`, { name, power: powerValue, notes, bestiary: beast, bestiaryText: beastText });
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
      res = await uploadImage(`/api/gm/npcs/${n.id}/image`, file);
    } catch {
      setBusy(false);
      return setMsg('Нет связи');
    }
    setBusy(false);
    if (!res.ok) return setMsg('Картинка не подошла');
    onChange((await res.json()) as GmNpc);
    setMsg(null);
  };
  // 3D-модель на 3D-карте (этап 34): сохраняется сразу при выборе
  const model = async (v: string) => {
    const m = v === '-' ? null : (v as UnitId);
    const r = await api<GmNpc>('POST', `/api/gm/npcs/${n.id}/model3d`, { model: m });
    if (!r.ok) return toast.error('Модель не сохранилась');
    onChange(r.data);
    toast(m ? `На 3D-карте — ${units.units[m]}` : 'На 3D-карте — фигурка');
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
      {(n.opponent || n.shown || n.acquaintances.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {n.opponent && <Badge tone="accent">Противник сессии</Badge>}
          {n.shown && <Badge tone="ok">Портрет на столе</Badge>}
          {n.acquaintances.length > 0 && (
            <span className="text-[13px] text-muted">
              Знакомы: {n.acquaintances.map((a) => `${a.characterName}${a.attitude !== 'unknown' ? ` (${ATTITUDE_LABELS[a.attitude].toLowerCase()})` : ''}`).join(', ')}
            </span>
          )}
        </div>
      )}
      <div className="grid items-start gap-4 @xl/main:grid-cols-[auto_minmax(0,1fr)]">
        <div className="grid justify-items-start gap-2">
          <div className="grid size-28 place-items-center overflow-hidden rounded-card border border-solid border-border bg-surface-2 text-muted">
            {n.image ? <Pic image={n.image} size="thumb" className="size-full" loading="lazy" /> : <span className="text-xs">без портрета</span>}
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
          <div className="grid gap-3 @xl/main:grid-cols-[minmax(0,1fr)_200px]">
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
          <Field label="На 3D-карте" hint="Вместо фигурки — объёмная модель (видят игроки и стол). На пергаменте и в бою на столе — фигурка.">
            {(id) => (
              <Select
                id={id}
                value={n.model3d ?? '-'}
                onValueChange={(v) => void model(v)}
                options={[{ value: '-', label: 'Фигурка' }, ...UNIT_IDS.map((u) => ({ value: u, label: units.units[u] }))]}
                className="@xl/main:max-w-[260px]"
              />
            )}
          </Field>
          <Field label="Заметки мастера (никуда не уходят)">
            {(id) => <Textarea id={id} rows={3} value={notes} maxLength={20000} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
          <div className="grid gap-2 rounded-control border border-dashed border-border p-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <Switch checked={beast} onCheckedChange={setBeast} label="В бестиарии (чудище для коллекции отряда)" />
              {n.bestiary && (
                <span className="text-[13px] text-muted">
                  {n.bestiaryUnlockedAt ? `открыт игрокам ${new Date(n.bestiaryUnlockedAt).toLocaleDateString('ru-RU')}` : 'игрокам ещё не открыт'} · бои: {n.fights}
                </span>
              )}
              {n.bestiary && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    const r = await api<GmNpc>('POST', `/api/gm/npcs/${n.id}/bestiary`, { open: !n.bestiaryUnlockedAt });
                    if (r.ok) {
                      onChange(r.data);
                      toast(n.bestiaryUnlockedAt ? 'Скрыто из бестиария' : 'Открыто в бестиарии, игрокам ушло уведомление');
                    } else toast.error(r.message ?? 'Не получилось');
                  }}
                >
                  {n.bestiaryUnlockedAt ? 'Скрыть' : 'Открыть в бестиарии'}
                </Button>
              )}
            </div>
            {beast && (
              <Field label="Описание для игроков (видно, когда чудище открыто)">
                {(id) => (
                  <Textarea
                    id={id}
                    rows={3}
                    value={beastText}
                    maxLength={2000}
                    onChange={(e) => setBeastText(e.target.value)}
                    placeholder="Что известно о твари: повадки, слабости, где водится"
                  />
                )}
              </Field>
            )}
            {beast && (
              <Button
                size="sm"
                variant="ghost"
                className="justify-self-start"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await api<{ text: string }>('POST', `/api/gm/npcs/${n.id}/bestiary-draft`, { hint: beastText.trim().slice(0, 1000) });
                  setBusy(false);
                  if (!r.ok) return toast.error(r.message ?? 'Черновик не получился');
                  setBeastText(r.data.text);
                  toast('Описание в поле — поправьте и сохраните');
                }}
              >
                Описать (Claude)
              </Button>
            )}
            <p className="m-0 text-[12.5px] text-muted">Чудище открывается отряду само, когда становится противником сессии. Сохраните флаг и описание кнопкой «Сохранить».</p>
          </div>
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
