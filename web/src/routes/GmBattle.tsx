import { useCallback, useEffect, useState } from 'react';
import { BATTLE_LIMITS, TERRAINS, TERRAIN_LABELS, type GmBattle, type GmCharacterListItem, type GmNpc, type Terrain } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { BattleGrid } from '../components/BattleGrid.tsx';
import { Badge, Button, Card, CardTitle, Field, Input, Segmented, Select, Skeleton, Switch, toast } from '../ui/index.ts';

// Тактическое поле боя у мастера (этап 60): создать поле, рисовать местность, ставить и двигать фишки, открыть игрокам и столу.

type Mode = 'move' | 'paint' | 'place';
type Pending = { kind: 'character' | 'npc' | 'mark'; refId: string | null; label: string } | null;
const NONE = '__none';

export function GmBattlePage() {
  const [b, setB] = useState<GmBattle | null | undefined>(undefined);
  const [chars, setChars] = useState<GmCharacterListItem[]>([]);
  const [npcs, setNpcs] = useState<GmNpc[]>([]);
  const [mode, setMode] = useState<Mode>('move');
  const [brush, setBrush] = useState<Terrain | 'erase'>('wall');
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const load = useCallback(async () => {
    const r = await api<{ battle: GmBattle | null }>('GET', '/api/gm/battle');
    if (r.ok) setB(r.data.battle);
  }, []);
  useEffect(() => {
    void load();
    void api<GmCharacterListItem[]>('GET', '/api/gm/characters').then((r) => r.ok && setChars(r.data));
    void api<GmNpc[]>('GET', '/api/gm/npcs').then((r) => r.ok && setNpcs(r.data));
  }, [load]);
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void load();
  }, [conn, load]);
  useSocketEvent('gm:battle.changed', () => void load());

  const post = async (path: string, body?: unknown, ok?: string): Promise<boolean> => {
    const r = await api<{ battle: GmBattle | null }>('POST', path, body);
    if (!r.ok) {
      toast.error(r.error === 'bad_cell' ? 'Клетка занята или вне поля' : 'Не получилось');
      return false;
    }
    setB(r.data.battle);
    if (ok) toast(ok);
    return true;
  };

  if (b === undefined) return <Skeleton className="h-64" />;
  if (b === null) return <CreateBattle onCreate={(body) => void post('/api/gm/battle', body, 'Поле создано')} />;

  const tokenAt = (col: number, row: number) => b.tokens.find((t) => t.col === col && t.row === row);
  const onCell = async (col: number, row: number) => {
    if (mode === 'paint') return void post('/api/gm/battle/patch', { paint: { col, row, t: brush === 'erase' ? null : brush } });
    if (mode === 'place' && pending) {
      if (await post('/api/gm/battle/tokens', { ...pending, col, row })) {
        setPending(null);
        setMode('move');
      }
      return;
    }
    const at = tokenAt(col, row);
    if (at) return setSelected(at.id === selected ? null : at.id);
    if (selected) void post(`/api/gm/battle/tokens/${encodeURIComponent(selected)}`, { col, row });
  };
  const sel = selected ? b.tokens.find((t) => t.id === selected) : undefined;
  const onBoard = new Set(b.tokens.filter((t) => t.kind === 'character').map((t) => t.refId));
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="grow">Бой{b.title ? `: ${b.title}` : ''}</CardTitle>
          <Badge tone={b.open ? 'ok' : 'neutral'}>{b.open ? 'видят игроки и стол' : 'только у вас'}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Switch
            checked={b.open}
            onCheckedChange={(v) => void post('/api/gm/battle/patch', { open: v }, v ? 'Поле открыто игрокам и столу' : 'Поле скрыто')}
            label="Открыть игрокам и столу"
          />
          <Switch checked={b.playerMoves} onCheckedChange={(v) => void post('/api/gm/battle/patch', { playerMoves: v })} label="Игроки двигают свои фишки" />
          <EndButton onEnd={() => void post('/api/gm/battle/end', undefined, 'Бой закончен, поле убрано')} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            label="Режим"
            value={mode}
            onChange={(v) => {
              setMode(v);
              if (v !== 'place') setPending(null);
            }}
            options={[
              { value: 'move', label: 'Фишки' },
              { value: 'paint', label: 'Местность' },
              { value: 'place', label: 'Поставить' },
            ]}
          />
          {mode === 'paint' && (
            <Segmented
              label="Кисть"
              value={brush}
              onChange={setBrush}
              options={[...TERRAINS.map((t) => ({ value: t, label: TERRAIN_LABELS[t] })), { value: 'erase' as const, label: 'Стереть' }]}
            />
          )}
        </div>
        {mode === 'place' && (
          <div className="grid gap-2 @xl/main:grid-cols-3">
            <Field label="Персонаж">
              {(id) => (
                <Select
                  id={id}
                  value={pending?.kind === 'character' ? pending.refId! : NONE}
                  onValueChange={(v) => setPending(v === NONE ? null : { kind: 'character', refId: v, label: '' })}
                  options={[
                    { value: NONE, label: '—' },
                    ...chars.filter((c) => !onBoard.has(c.id)).map((c) => ({ value: c.id, label: c.ownerName ? `${c.name} (${c.ownerName})` : c.name })),
                  ]}
                />
              )}
            </Field>
            <Field label="Противник из библиотеки">
              {(id) => (
                <Select
                  id={id}
                  value={pending?.kind === 'npc' ? pending.refId! : NONE}
                  onValueChange={(v) => setPending(v === NONE ? null : { kind: 'npc', refId: v, label: '' })}
                  options={[{ value: NONE, label: '—' }, ...npcs.map((n) => ({ value: n.id, label: n.name || 'Без имени' }))]}
                />
              )}
            </Field>
            <Field label="Метка (подпись)">
              {(id) => (
                <Input
                  id={id}
                  maxLength={40}
                  value={pending?.kind === 'mark' ? pending.label : ''}
                  onChange={(e) => setPending(e.target.value ? { kind: 'mark', refId: null, label: e.target.value } : null)}
                  placeholder="Сундук, ловушка…"
                />
              )}
            </Field>
          </div>
        )}
        <p className="m-0 text-[13px] text-muted">
          {mode === 'move'
            ? 'Нажмите фишку, затем клетку — фишка перейдёт. Повторное нажатие на фишку снимает выделение.'
            : mode === 'paint'
              ? 'Нажимайте клетки, чтобы рисовать стены, труднопроходимые места и воду. Стены игрокам не пройти.'
              : pending
                ? 'Теперь нажмите клетку, куда поставить фишку.'
                : 'Выберите персонажа, противника или напишите метку — затем нажмите клетку.'}
        </p>
        <BattleGrid
          cols={b.cols}
          rows={b.rows}
          terrain={b.terrain}
          tokens={b.tokens}
          selected={selected}
          onCell={(c, r) => void onCell(c, r)}
          onToken={(id) => (mode === 'move' ? setSelected(id === selected ? null : id) : undefined)}
        />
        {sel && mode === 'move' && (
          <div className="flex flex-wrap items-center gap-3 rounded-control border border-solid border-border p-2.5">
            <b className="grow">{sel.name}</b>
            <Switch checked={sel.hidden} onCheckedChange={(v) => void post(`/api/gm/battle/tokens/${encodeURIComponent(sel.id)}`, { hidden: v })} label="Скрыта (засада)" />
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (await post(`/api/gm/battle/tokens/${encodeURIComponent(sel.id)}/delete`)) setSelected(null);
              }}
            >
              Убрать с поля
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}

function EndButton({ onEnd }: { onEnd: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <Button variant={sure ? 'danger' : 'ghost'} className="ml-auto" onBlur={() => setSure(false)} onClick={() => (sure ? onEnd() : setSure(true))}>
      {sure ? 'Точно закончить?' : 'Закончить бой'}
    </Button>
  );
}

function CreateBattle({ onCreate }: { onCreate: (b: { title: string; cols: number; rows: number }) => void }) {
  const [title, setTitle] = useState('');
  const [cols, setCols] = useState(16);
  const [rows, setRows] = useState(10);
  const clamp = (v: number, a: number, z: number) => Math.max(a, Math.min(z, Math.round(v) || a));
  return (
    <Card>
      <CardTitle>Бой</CardTitle>
      <p className="m-0 text-[14px] text-muted">Поле из шестиугольников: местность, фишки персонажей, противников и меток. Пока поле не открыто, его видите только вы.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Подпись (необязательно)" className="min-w-[200px] grow">
          {(id) => <Input id={id} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Засада у моста" />}
        </Field>
        <Field label={`Ширина (${BATTLE_LIMITS.minCols}–${BATTLE_LIMITS.maxCols})`}>
          {(id) => (
            <Input id={id} type="number" className="w-24" min={BATTLE_LIMITS.minCols} max={BATTLE_LIMITS.maxCols} value={cols} onChange={(e) => setCols(Number(e.target.value))} />
          )}
        </Field>
        <Field label={`Высота (${BATTLE_LIMITS.minRows}–${BATTLE_LIMITS.maxRows})`}>
          {(id) => (
            <Input id={id} type="number" className="w-24" min={BATTLE_LIMITS.minRows} max={BATTLE_LIMITS.maxRows} value={rows} onChange={(e) => setRows(Number(e.target.value))} />
          )}
        </Field>
        <Button
          variant="primary"
          onClick={() => onCreate({ title, cols: clamp(cols, BATTLE_LIMITS.minCols, BATTLE_LIMITS.maxCols), rows: clamp(rows, BATTLE_LIMITS.minRows, BATTLE_LIMITS.maxRows) })}
        >
          Создать поле
        </Button>
      </div>
    </Card>
  );
}
