import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Figure, GmAck, GmCharacterView, GmSlotView, HintCheck } from '@zg/shared';
import { GmSlot, SaveField } from '../components/GmSlot.tsx';
import { PlayerCard } from '../components/PlayerCard.tsx';
import { ThemePick } from '../components/ThemePick.tsx';
import { SheetPanel } from '../components/SheetPanel.tsx';
import { SummaryPanel } from '../components/SummaryPanel.tsx';
import { api } from '../lib/api.ts';
import { OWNER_ERRORS, usePlayers } from '../lib/gm.ts';
import { emitGm, useConnection, useSocketEvent } from '../lib/socket.ts';
import { cn } from '../lib/cn.ts';
import { Button, buttonVariants, Card, Field, Input, Select, Sheet, Switch, TabPanel, Tabs, Textarea, toast } from '../ui/index.ts';

// Конструктор фигурки — отдельный чанк: каталог деталей нужен только на этой вкладке.
const FigureEditor = lazy(() => import('../figure/FigureEditor.tsx').then((m) => ({ default: m.FigureEditor })));

const STAGES = ['Спит', 'Пробуждение', 'Освоение', 'Мастерство', 'Предел'];
type Tab = 'traits' | 'sheet' | 'summaries' | 'figure' | 'notes';
type SlotPatch = (s: GmSlotView) => GmSlotView;

const levelOf = (r: GmSlotView['revealed']): GmSlotView['revealLevel'] => (r.trait ? 'revealed' : r.hint.trim() ? 'hinted' : 'hidden');

/**
 * Страница персонажа у мастера: шапка с игроком, силой и оформлением; вкладки «Черты / Лист / Сводки / Заметки»;
 * справа (или листом на узком экране) — карточка, как её увидит игрок. Ступень и раскрытие меняются на экране сразу;
 * если сервер отказал — страница перечитывается с сервера и показывается ошибка.
 */
export function GmCharacter() {
  const { id = '' } = useParams();
  const [c, setC] = useState<GmCharacterView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('traits');
  const [previewSheet, setPreviewSheet] = useState(false);
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

  /** Сразу на экране, потом на сервер; при отказе — перечитать и сказать. */
  const optimistic = async (slot: number, patch: SlotPatch, send: () => Promise<GmAck>) => {
    setC((cur) => cur && { ...cur, slots: cur.slots.map((s) => (s.index === slot ? patch(s) : s)) });
    const r = await send();
    if (!r.ok) {
      toast.error(r.error === 'offline' ? 'Нет связи: изменение не сохранилось' : `Не получилось: ${r.error}`);
      void load();
    }
    return r.ok;
  };

  const meta = async (patch: Record<string, unknown>, ok?: string) => {
    const r = await api<GmCharacterView>('POST', `/api/gm/characters/${encodeURIComponent(id)}/meta`, patch);
    if (r.ok) {
      setC(r.data);
      setError(null);
      if (ok) toast(ok);
    } else setError(OWNER_ERRORS[r.error] ?? `Не сохранилось: ${r.error}`);
  };
  const figure = async (f: Figure | null) => {
    const r = await api<GmCharacterView>('POST', `/api/gm/characters/${encodeURIComponent(id)}/figure`, f);
    if (!r.ok) {
      toast.error(`Не сохранилось: ${r.error}`);
      return false;
    }
    setC(r.data);
    toast(f ? 'Фигурка сохранена' : 'Фигурка убрана');
    return true;
  };
  const power = async (patch: Record<string, unknown>) => {
    const r = await api<GmCharacterView>('POST', `/api/gm/characters/${encodeURIComponent(id)}/power`, patch);
    if (r.ok) {
      setC(r.data);
      setError(null);
    } else setError(`Не сохранилось: ${r.error}`);
  };

  if (!c) return error ? <p className="error">{error}</p> : <p className="muted">Загрузка…</p>;

  const owner = players.find((p) => p.id === c.ownerMemberId)?.name;
  const preview = (
    <>
      <p className="m-0 font-ui text-[13px] text-muted">Ровно то, что получит игрок. Обновляется сразу после изменений.</p>
      <PlayerCard c={c.player} fx={false} />
    </>
  );
  return (
    <div className="@container/char">
      <div className="grid items-start gap-5 @4xl/char:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <nav aria-label="Путь" className="flex items-center gap-2 font-ui text-sm text-muted">
            <Link to="/gm/party" viewTransition className="text-link">
              Партия
            </Link>
            <span aria-hidden="true">›</span>
            <span className="truncate text-text">{c.name}</span>
          </nav>

          <Card>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="m-0 grow font-name text-[2rem] leading-tight font-normal">{c.name}</h1>
              {c.seed && <span className="font-mono text-xs text-muted">сид {c.seed}</span>}
            </div>
            <p className="m-0 text-[14px] text-muted">
              {[c.kind === 'local' ? 'Местный' : c.origin, c.archLabel && c.kind === 'popadanets' ? `архетип: ${c.archLabel}` : '', owner ? `игрок: ${owner}` : 'без игрока']
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="grid gap-3 @xl/char:grid-cols-3">
              <Field label="Игрок">
                {(fid) => (
                  <Select
                    id={fid}
                    value={c.ownerMemberId ?? 'none'}
                    onValueChange={(v) => meta({ ownerMemberId: v === 'none' ? null : v }, v === 'none' ? 'Персонаж ни у кого' : 'Игрок назначен')}
                    options={[{ value: 'none', label: 'никому' }, ...players.map((p) => ({ value: p.id, label: p.name }))]}
                  />
                )}
              </Field>
              <PowerBox c={c} onSave={power} />
              <ThemePick look={c.player.look} onPick={(k) => meta({ cardTheme: k }, 'Оформление сменено')} />
            </div>
            <Switch checked={c.power.show} onCheckedChange={(v) => power({ show: v })} label="Показывать игроку ступень силы" />
            <div className="flex flex-wrap gap-2">
              <Button className="@4xl/char:hidden" onClick={() => setPreviewSheet(true)}>
                Как увидит игрок
              </Button>
              <a className={cn(buttonVariants({ variant: 'ghost' }), 'no-underline')} href={`/api/gm/characters/${encodeURIComponent(id)}/export`}>
                Экспорт JSON
              </a>
            </div>
            {error && <p className="error m-0">{error}</p>}
          </Card>

          <Tabs
            label="Разделы персонажа"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'traits', label: `Черты · ${c.slots.length}` },
              { value: 'sheet', label: 'Лист' },
              { value: 'summaries', label: 'Сводки' },
              { value: 'figure', label: 'Фигурка' },
              { value: 'notes', label: 'Заметки' },
            ]}
          >
            <TabPanel value="traits" className="flex flex-col gap-4 focus:outline-none">
              {c.slots.map((s) => (
                <GmSlot key={`${s.index}-${s.traitId}`} s={s}>
                  <SlotControls characterId={c.id} s={s} optimistic={optimistic} />
                </GmSlot>
              ))}
              {c.combos.length > 0 && (
                <Card>
                  <h3 className="m-0">Сочетания</h3>
                  {c.combos.map((x, i) => (
                    <p key={i} className="m-0">
                      {x.text}
                    </p>
                  ))}
                </Card>
              )}
              {c.slots.some((s) => s.cat === 'green') && (
                <Card>
                  <p className="small m-0">{c.greenSigns}</p>
                </Card>
              )}
            </TabPanel>
            <TabPanel value="sheet" className="flex flex-col gap-4 focus:outline-none">
              <SheetPanel c={c} onChange={setC} />
            </TabPanel>
            <TabPanel value="summaries" className="flex flex-col gap-4 focus:outline-none">
              <SummaryPanel c={c} onChange={setC} />
            </TabPanel>
            <TabPanel value="figure" className="flex max-w-[560px] flex-col gap-4 focus:outline-none">
              {tab === 'figure' && (
                <Suspense fallback={<p className="muted">Загрузка…</p>}>
                  <FigureEditor
                    key={c.id}
                    value={c.figure}
                    onSave={figure}
                    onClear={() => figure(null)}
                    note={c.ownerMemberId ? 'Игрок может менять фигурку сам, во вкладке «Фигурка».' : 'Фигурку увидят игроки и стол — на карте и в бою.'}
                  />
                </Suspense>
              )}
            </TabPanel>
            <TabPanel value="notes" className="flex flex-col gap-4 focus:outline-none">
              <Card>
                {c.kind === 'local' && (
                  <SaveField label="Описание для игрока" value={c.publicBio} onSave={(v) => meta({ publicBio: v }, 'Описание сохранено')} rows={3} maxLength={4000} />
                )}
                <SaveField label="Заметки мастера" value={c.notes} onSave={(v) => meta({ notes: v }, 'Заметки сохранены')} rows={6} maxLength={20000} />
                {c.craft?.hook && (
                  <p className="small m-0">
                    <b>Ремесло, крючок:</b> {c.craft.hook}
                  </p>
                )}
              </Card>
            </TabPanel>
          </Tabs>
        </div>

        <aside aria-label="Как увидит игрок" className="sticky top-[76px] hidden max-h-[calc(100dvh-92px)] flex-col gap-2 overflow-y-auto overscroll-contain @4xl/char:flex">
          <h2 className="m-0 font-name text-[1.25rem] font-normal">Как увидит игрок</h2>
          {preview}
        </aside>
      </div>
      <Sheet open={previewSheet} onOpenChange={setPreviewSheet} title="Как увидит игрок">
        {preview}
      </Sheet>
    </div>
  );
}

function PowerBox({ c, onSave }: { c: GmCharacterView; onSave: (p: Record<string, unknown>) => Promise<void> }) {
  const [v, setV] = useState(String(c.power.value));
  useEffect(() => setV(String(c.power.value)), [c.power.value]);
  const n = Math.trunc(Number(v));
  const dirty = n > 0 && n !== c.power.value;
  return (
    <Field label={`Уровень силы · ${c.power.band}`}>
      {(id) => (
        <div className="flex gap-2">
          <Input
            id={id}
            inputMode="numeric"
            value={v}
            onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && dirty && void onSave({ value: n })}
            className="font-mono tabular-nums"
          />
          {dirty && (
            <Button variant="primary" onClick={() => onSave({ value: n })}>
              ОК
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}

function SlotControls({
  characterId,
  s,
  optimistic,
}: {
  characterId: string;
  s: GmSlotView;
  optimistic: (slot: number, patch: SlotPatch, send: () => Promise<GmAck>) => Promise<boolean>;
}) {
  const target = { characterId, slot: s.index };
  const [hint, setHint] = useState(s.revealed.hint);
  const [check, setCheck] = useState<HintCheck | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    setHint(s.revealed.hint);
    setCheck(null);
  }, [s.revealed.hint]);

  const reveal = (patch: Partial<GmSlotView['revealed']>) =>
    optimistic(
      s.index,
      (x) => {
        const revealed = { ...x.revealed, ...patch };
        return { ...x, revealed, revealLevel: levelOf(revealed) };
      },
      () => emitGm('gm:trait.setReveal', { ...target, patch }),
    );
  const stage = (to: number) =>
    optimistic(
      s.index,
      (x) => ({ ...x, stage: to, stageName: STAGES[to] ?? x.stageName, revealed: { ...x.revealed, stages: Math.min(x.revealed.stages, to) } }),
      () => emitGm('gm:trait.setStage', { ...target, stage: to }),
    );
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
    if (await reveal({ hint })) toast('Подсказка сохранена');
  };

  const sees = s.revealLevel === 'revealed' ? `черту${s.revealed.stages ? `, ступеней: ${s.revealed.stages}` : ''}` : s.revealLevel === 'hinted' ? 'только подсказку' : 'ничего';
  return (
    <div className="grid gap-3 border-t border-solid border-border pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-control border border-solid border-border bg-surface-2 p-0.5">
          <Button variant="ghost" size="icon" className="size-9" disabled={s.stage <= 0} onClick={() => stage(s.stage - 1)} aria-label="Ступень ниже">
            −
          </Button>
          <span className="min-w-[150px] text-center font-ui text-[15px]" aria-live="polite">
            <b>{STAGES[s.stage]}</b> <span className="text-muted">· {s.stage} из 4</span>
          </span>
          <Button variant="ghost" size="icon" className="size-9" disabled={s.stage >= 4} onClick={() => stage(s.stage + 1)} aria-label="Ступень выше">
            +
          </Button>
        </div>
        <span className="ml-auto font-ui text-[13px] text-muted">Игрок видит: {sees}</span>
      </div>
      {s.stagePowerHint && <p className="small warn-text m-0">{s.stagePowerHint}</p>}
      {s.stage === 4 && s.forkOptions && (
        <div className="flex flex-wrap gap-2">
          {(['a', 'b'] as const).map((k) => (
            <Button
              key={k}
              variant={s.fork === k ? 'primary' : 'default'}
              onClick={() =>
                optimistic(
                  s.index,
                  (x) => ({ ...x, fork: k }),
                  () => emitGm('gm:trait.setFork', { ...target, fork: k }),
                )
              }
            >
              {s.forkOptions![k].title}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Switch checked={s.revealed.trait} onCheckedChange={(v) => reveal({ trait: v })} label="Раскрыть черту" />
        {s.revealed.trait && s.price && <Switch checked={s.revealed.price} onCheckedChange={(v) => reveal({ price: v })} label="Показать цену" />}
      </div>
      {s.revealed.trait && (
        <label className="grid gap-1.5 font-ui text-[13px] text-muted">
          Показать ступеней: {s.revealed.stages} из {s.stage}
          <input
            type="range"
            min={0}
            max={s.stage}
            value={s.revealed.stages}
            disabled={s.stage === 0}
            onChange={(e) => reveal({ stages: Number(e.target.value) })}
            className="accent-[var(--accent)]"
          />
        </label>
      )}
      <Field label="Подсказка игроку (проверяет Jev)">{(id) => <Textarea id={id} rows={2} maxLength={300} value={hint} onChange={(e) => setHint(e.target.value)} />}</Field>
      {hint !== s.revealed.hint && (
        <div className="flex gap-2">
          <Button disabled={checking} onClick={() => saveHint(false)}>
            {checking ? 'Проверяю…' : 'Сохранить подсказку'}
          </Button>
          <Button variant="ghost" onClick={() => (setHint(s.revealed.hint), setCheck(null))}>
            Отменить
          </Button>
        </div>
      )}
      {check && (
        <div className="jev-warn">
          {check.status === 'unavailable' ? (
            <p>Проверка недоступна (Jev не ответил).</p>
          ) : (
            <>
              {check.selfScore !== null && check.selfScore >= 3 && <p>Подсказка почти раскрывает эту черту (оценка {check.selfScore.toFixed(1)} из 4).</p>}
              {check.others.map((o) => (
                <p key={o.traitName}>
                  Похоже, выдаёт другую скрытую черту «{o.traitName}» ({Math.round(o.probability * 100)}%).
                </p>
              ))}
            </>
          )}
          <div className="flex gap-2">
            <Button onClick={() => saveHint(true)}>Сохранить всё равно</Button>
            <Button variant="ghost" onClick={() => setCheck(null)}>
              Поправить
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
