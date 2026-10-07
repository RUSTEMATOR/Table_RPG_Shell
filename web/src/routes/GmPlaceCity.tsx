import { useCallback, useEffect, useState } from 'react';
import {
  RUMOR_KINDS,
  RUMOR_KIND_LABELS,
  SPOT_KINDS,
  SPOT_KIND_LABELS,
  type GmPlaceDetail,
  type GmPresence,
  type GmRumor,
  type GmSpot,
  type PlaceDraft,
  type RumorKind,
  type SpotKind,
} from '@zg/shared';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';
import { cn } from '../lib/cn.ts';
import { Badge, Button, buttonVariants, Card, Field, GameIcon, Input, RUMOR_ICON, Select, SPOT_ICON, Switch, TabPanel, Tabs, Textarea, toast } from '../ui/index.ts';

// Город у мастера (этап 27): карточка (описание, правитель, фракция, население, картинка), места в городе, слухи и
// задания (открываются игрокам по одному), «кто здесь» (противники из библиотеки). «Набросать» — черновик Claude
// в поле: он не сохраняется, пока мастер не нажмёт «Сохранить» или «Добавить».

type Tab = 'card' | 'spots' | 'rumors' | 'here';

export function GmPlaceCity({ placeId }: { placeId: string }) {
  const [d, setD] = useState<GmPlaceDetail | null>(null);
  const [tab, setTab] = useState<Tab>('card');
  const url = `/api/gm/maps/places/${placeId}`;
  const reload = useCallback(async () => {
    const r = await api<GmPlaceDetail>('GET', `${url}/detail`);
    if (r.ok) setD(r.data);
  }, [url]);
  useEffect(() => {
    setD(null);
    void reload();
  }, [reload]);
  useSocketEvent('gm:place.changed', (e) => e.placeId === placeId && void reload());

  /** Правка карточки: ответ — новая карточка. */
  const send = async (path: string, body: unknown, ok?: string): Promise<boolean> => {
    const r = await api<GmPlaceDetail>('POST', path, body);
    if (!r.ok) {
      toast.error(r.error === 'bad_request' ? 'Проверьте поля' : 'Не сохранилось');
      return false;
    }
    if ('spots' in r.data) setD(r.data);
    else void reload();
    if (ok) toast(ok);
    return true;
  };

  if (!d) return <Card className="text-muted">Загрузка города…</Card>;
  return (
    <Card className="gap-3">
      <Tabs
        label="Город"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'card', label: 'Карточка' },
          { value: 'spots', label: `Места${d.spots.length ? ` · ${d.spots.length}` : ''}` },
          { value: 'rumors', label: `Слухи${d.rumors.length ? ` · ${d.rumors.length}` : ''}` },
          { value: 'here', label: `Кто здесь${d.presence.length ? ` · ${d.presence.length}` : ''}` },
        ]}
      >
        <TabPanel value="card">
          <CardTab key={d.id} d={d} url={url} send={send} onImage={reload} />
        </TabPanel>
        <TabPanel value="spots">
          <SpotsTab d={d} url={url} send={send} />
        </TabPanel>
        <TabPanel value="rumors">
          <RumorsTab d={d} url={url} send={send} />
        </TabPanel>
        <TabPanel value="here">
          <HereTab d={d} url={url} send={send} />
        </TabPanel>
      </Tabs>
    </Card>
  );
}

type Send = (path: string, body: unknown, ok?: string) => Promise<boolean>;

async function draft<P extends PlaceDraft['part']>(url: string, part: P): Promise<Extract<PlaceDraft, { part: P }> | null> {
  const r = await api<PlaceDraft>('POST', `${url}/draft`, { part });
  if (!r.ok) {
    toast.error(r.message ?? 'Черновик не получился');
    return null;
  }
  return r.data as Extract<PlaceDraft, { part: P }>;
}

function DraftButton({ enabled, busy, onClick, children = 'Набросать' }: { enabled: boolean; busy: boolean; onClick: () => void; children?: string }) {
  if (!enabled) return null;
  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={onClick} title="Черновик Claude: появится в поле, сохраняете вы">
      {busy ? 'Пишу…' : children}
    </Button>
  );
}

function CardTab({ d, url, send, onImage }: { d: GmPlaceDetail; url: string; send: Send; onImage: () => void }) {
  const [f, setF] = useState({ description: d.description, ruler: d.ruler, faction: d.faction, population: d.population });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dirty = f.description !== d.description || f.ruler !== d.ruler || f.faction !== d.faction || f.population !== d.population;
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await fetch(`${url}/image`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': file.type || 'image/jpeg' }, body: file });
      if (!res.ok) toast.error('Картинка не загрузилась');
      else onImage();
    } catch {
      toast.error('Нет связи');
    }
    setUploading(false);
  };

  return (
    <div className="grid gap-3">
      {!d.visible && <p className="m-0 text-[13px] text-muted">Место скрыто: игроки увидят карточку, когда вы его откроете.</p>}
      <Field label="Описание (видят игроки)">
        {(id) => (
          <Textarea
            id={id}
            rows={5}
            value={f.description}
            maxLength={4000}
            onChange={(e) => set('description')(e.target.value)}
            placeholder="Что видят путники, чем живёт место…"
          />
        )}
      </Field>
      <div className="-mt-1 flex gap-2">
        <DraftButton
          enabled={d.drafts}
          busy={busy}
          onClick={async () => {
            setBusy(true);
            const r = await draft(url, 'description');
            setBusy(false);
            if (r) set('description')(r.text);
          }}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Правитель">{(id) => <Input id={id} value={f.ruler} maxLength={120} onChange={(e) => set('ruler')(e.target.value)} />}</Field>
        <Field label="Фракция">{(id) => <Input id={id} value={f.faction} maxLength={120} onChange={(e) => set('faction')(e.target.value)} />}</Field>
        <Field label="Население">{(id) => <Input id={id} value={f.population} maxLength={60} onChange={(e) => set('population')(e.target.value)} placeholder="≈ 4 000" />}</Field>
      </div>
      {dirty && (
        <Button variant="primary" onClick={() => void send(url, f, 'Карточка сохранена')}>
          Сохранить карточку
        </Button>
      )}
      <div className="flex flex-wrap items-end gap-3 border-t border-solid border-border pt-3">
        {d.image && (
          <img src={d.image.url} alt="" width={d.image.w} height={d.image.h} loading="lazy" className="h-auto max-h-32 w-auto max-w-[220px] rounded-control object-cover" />
        )}
        <label className={cn(buttonVariants({ size: 'sm' }), uploading && 'pointer-events-none opacity-50')}>
          {d.image ? 'Заменить картинку' : 'Картинка города'}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} disabled={uploading} />
        </label>
        {d.image && (
          <Button size="sm" variant="ghost" onClick={() => void send(`${url}/image/delete`, {}, 'Картинка убрана')}>
            Убрать картинку
          </Button>
        )}
        <span className="text-[12.5px] text-muted">Фон экрана города у игроков и на столе. Без картинки — вид города в 3D.</span>
      </div>
    </div>
  );
}

function SpotsTab({ d, url, send }: { d: GmPlaceDetail; url: string; send: Send }) {
  const [busy, setBusy] = useState(false);
  const [ideas, setIdeas] = useState<{ kind: SpotKind; name: string; description: string }[]>([]);
  const add = (s: { kind: SpotKind; name: string; description: string }) => send(`${url}/spots`, s, 'Место в городе добавлено');
  return (
    <div className="grid gap-3">
      {d.spots.length === 0 && <p className="m-0 text-[13.6px] text-muted">Мест в городе пока нет. Их видят игроки на экране города (скрытые — нет).</p>}
      {d.spots.map((s) => (
        <SpotRow key={s.id} s={s} send={send} />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void add({ kind: 'tavern', name: '', description: '' })}>
          + Место
        </Button>
        <DraftButton
          enabled={d.drafts}
          busy={busy}
          onClick={async () => {
            setBusy(true);
            const r = await draft(url, 'spots');
            setBusy(false);
            if (r) setIdeas(r.spots);
          }}
        >
          Набросать места
        </DraftButton>
      </div>
      {ideas.length > 0 && (
        <Ideas
          items={ideas.map((s) => ({ title: `${SPOT_KIND_LABELS[s.kind]} · ${s.name}`, text: s.description }))}
          onAdd={async (i) => {
            if (await add(ideas[i]!)) setIdeas((l) => l.filter((_, n) => n !== i));
          }}
          onClose={() => setIdeas([])}
        />
      )}
    </div>
  );
}

function SpotRow({ s, send }: { s: GmSpot; send: Send }) {
  const [f, setF] = useState({ name: s.name, description: s.description, noteGm: s.noteGm });
  useEffect(() => setF({ name: s.name, description: s.description, noteGm: s.noteGm }), [s.name, s.description, s.noteGm]);
  const [del, setDel] = useState(false);
  const url = `/api/gm/maps/spots/${s.id}`;
  const dirty = f.name !== s.name || f.description !== s.description || f.noteGm !== s.noteGm;
  return (
    <div className={cn('grid gap-2 rounded-control border border-solid border-border p-2.5', !s.visible && 'border-dashed opacity-80')}>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Вид места"
          value={s.kind}
          onValueChange={(v) => void send(url, { kind: v as SpotKind })}
          options={SPOT_KINDS.map((k) => ({
            value: k,
            label: (
              <span className="inline-flex items-center gap-2">
                <GameIcon name={SPOT_ICON[k]} className="text-muted" />
                {SPOT_KIND_LABELS[k]}
              </span>
            ),
          }))}
          className="min-w-[130px]"
        />
        <Input
          aria-label="Название"
          value={f.name}
          maxLength={120}
          placeholder={SPOT_KIND_LABELS[s.kind]}
          onChange={(e) => setF((o) => ({ ...o, name: e.target.value }))}
          className="min-w-0 grow"
        />
      </div>
      <Textarea
        aria-label="Описание (видят игроки)"
        rows={2}
        value={f.description}
        maxLength={4000}
        placeholder="Описание (видят игроки)"
        onChange={(e) => setF((o) => ({ ...o, description: e.target.value }))}
      />
      <Textarea
        aria-label="Заметка мастера"
        rows={1}
        value={f.noteGm}
        maxLength={4000}
        placeholder="Заметка мастера (никуда не уходит)"
        onChange={(e) => setF((o) => ({ ...o, noteGm: e.target.value }))}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Switch checked={s.visible} onCheckedChange={(v) => void send(url, { visible: v })} label="Видно игрокам" />
        <span className="grow" />
        {dirty && (
          <Button size="sm" variant="primary" onClick={() => void send(url, f, 'Сохранено')}>
            Сохранить
          </Button>
        )}
        <Button
          size="sm"
          variant={del ? 'danger' : 'ghost'}
          onBlur={() => setDel(false)}
          onClick={() => (del ? void send(`${url}/delete`, {}, 'Место в городе удалено') : setDel(true))}
        >
          {del ? 'Точно?' : 'Удалить'}
        </Button>
      </div>
    </div>
  );
}

function RumorsTab({ d, url, send }: { d: GmPlaceDetail; url: string; send: Send }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<RumorKind>('rumor');
  const [busy, setBusy] = useState(false);
  const [ideas, setIdeas] = useState<{ kind: RumorKind; text: string }[]>([]);
  const add = (r: { kind: RumorKind; text: string }) => send(`${url}/rumors`, r, 'Добавлено (пока скрыто)');
  const open = d.rumors.filter((r) => r.visible).length;
  return (
    <div className="grid gap-3">
      <p className="m-0 text-[13.6px] text-muted">
        Новые слухи и задания скрыты; «Открыть» — и игроки увидят их в экране города, в порядке, в каком вы открывали. Открыто: {open} из {d.rumors.length}.
      </p>
      {d.rumors.map((r) => (
        <RumorRow key={r.id} r={r} send={send} />
      ))}
      <div className="grid gap-2 rounded-control border border-dashed border-border p-2.5">
        <div className="flex gap-2">
          <Select
            aria-label="Слух или задание"
            value={kind}
            onValueChange={(v) => setKind(v as RumorKind)}
            options={RUMOR_KINDS.map((k) => ({ value: k, label: RUMOR_KIND_LABELS[k] }))}
            className="min-w-[120px]"
          />
          <Input aria-label="Текст" value={text} maxLength={1000} placeholder="Говорят, что…" onChange={(e) => setText(e.target.value)} className="min-w-0 grow" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!text.trim()}
            onClick={async () => {
              if (await add({ kind, text: text.trim() })) setText('');
            }}
          >
            + Добавить
          </Button>
          <DraftButton
            enabled={d.drafts}
            busy={busy}
            onClick={async () => {
              setBusy(true);
              const r = await draft(url, 'rumors');
              setBusy(false);
              if (r) setIdeas(r.rumors);
            }}
          >
            Набросать слухи
          </DraftButton>
        </div>
      </div>
      {ideas.length > 0 && (
        <Ideas
          items={ideas.map((r) => ({ title: RUMOR_KIND_LABELS[r.kind], text: r.text }))}
          onAdd={async (i) => {
            if (await add(ideas[i]!)) setIdeas((l) => l.filter((_, n) => n !== i));
          }}
          onClose={() => setIdeas([])}
        />
      )}
    </div>
  );
}

function RumorRow({ r, send }: { r: GmRumor; send: Send }) {
  const [text, setText] = useState(r.text);
  const [noteGm, setNoteGm] = useState(r.noteGm);
  useEffect(() => {
    setText(r.text);
    setNoteGm(r.noteGm);
  }, [r.text, r.noteGm]);
  const [del, setDel] = useState(false);
  const url = `/api/gm/maps/rumors/${r.id}`;
  const dirty = text !== r.text || noteGm !== r.noteGm;
  return (
    <div className={cn('grid gap-2 rounded-control border border-solid border-border p-2.5', !r.visible && 'border-dashed')}>
      <div className="flex items-center gap-2">
        <Badge tone={r.kind === 'quest' ? 'warn' : 'neutral'}>
          <GameIcon name={RUMOR_ICON[r.kind]} className="mr-1" />
          {RUMOR_KIND_LABELS[r.kind]}
        </Badge>
        {r.visible ? <Badge tone="ok">Открыт</Badge> : <span className="text-[12.5px] text-muted">скрыт</span>}
        <span className="grow" />
        <Button size="sm" variant={r.visible ? 'ghost' : 'primary'} onClick={() => void send(url, { visible: !r.visible }, r.visible ? 'Скрыто' : 'Открыто игрокам')}>
          {r.visible ? 'Скрыть' : 'Открыть'}
        </Button>
      </div>
      <Textarea aria-label="Текст (видят игроки, когда открыт)" rows={2} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      <Textarea
        aria-label="Заметка мастера"
        rows={1}
        value={noteGm}
        maxLength={4000}
        placeholder="Заметка мастера: правда ли это, к чему ведёт"
        onChange={(e) => setNoteGm(e.target.value)}
      />
      <div className="flex gap-2">
        <span className="grow" />
        {dirty && (
          <Button size="sm" variant="primary" onClick={() => void send(url, { text, noteGm }, 'Сохранено')}>
            Сохранить
          </Button>
        )}
        <Button size="sm" variant={del ? 'danger' : 'ghost'} onBlur={() => setDel(false)} onClick={() => (del ? void send(`${url}/delete`, {}, 'Удалено') : setDel(true))}>
          {del ? 'Точно?' : 'Удалить'}
        </Button>
      </div>
    </div>
  );
}

function HereTab({ d, url, send }: { d: GmPlaceDetail; url: string; send: Send }) {
  const [npc, setNpc] = useState('');
  const [spot, setSpot] = useState('');
  const [label, setLabel] = useState('');
  const spotOptions = [{ value: '-', label: 'В городе' }, ...d.spots.map((s) => ({ value: s.id, label: s.name || SPOT_KIND_LABELS[s.kind] }))];
  return (
    <div className="grid gap-3">
      <p className="m-0 text-[13.6px] text-muted">
        Противники и NPC из библиотеки, которых можно встретить здесь. Игроки видят имя, фигурку и роль — без силы и заметок. Добавленные скрыты.
      </p>
      {d.presence.map((x) => (
        <HereRow key={x.id} x={x} spotOptions={spotOptions} send={send} />
      ))}
      {d.npcs.length === 0 ? (
        <p className="m-0 text-[13.6px] text-muted">В библиотеке противников пока никого нет («Противники»).</p>
      ) : (
        <div className="grid gap-2 rounded-control border border-dashed border-border p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select aria-label="Кто" value={npc} onValueChange={setNpc} options={d.npcs.map((n) => ({ value: n.id, label: n.name || 'Без имени' }))} placeholder="Кто" />
            <Select aria-label="Где" value={spot || '-'} onValueChange={setSpot} options={spotOptions} />
          </div>
          <Input aria-label="Роль (видят игроки)" value={label} maxLength={120} placeholder="Роль: трактирщик, капитан стражи…" onChange={(e) => setLabel(e.target.value)} />
          <Button
            size="sm"
            disabled={!npc}
            className="justify-self-start"
            onClick={async () => {
              if (await send(`${url}/presence`, { npcId: npc, spotId: spot && spot !== '-' ? spot : null, label: label.trim() }, 'Добавлено (пока скрыто)')) {
                setNpc('');
                setLabel('');
              }
            }}
          >
            + Добавить
          </Button>
        </div>
      )}
    </div>
  );
}

function HereRow({ x, spotOptions, send }: { x: GmPresence; spotOptions: { value: string; label: string }[]; send: Send }) {
  const [label, setLabel] = useState(x.label);
  useEffect(() => setLabel(x.label), [x.label]);
  const [del, setDel] = useState(false);
  const url = `/api/gm/maps/presence/${x.id}`;
  return (
    <div className={cn('grid gap-2 rounded-control border border-solid border-border p-2.5', !x.visible && 'border-dashed')}>
      <div className="flex flex-wrap items-center gap-2">
        <strong className="grow font-ui">{x.name || 'Без имени'}</strong>
        <Select aria-label="Где" value={x.spotId ?? '-'} onValueChange={(v) => void send(url, { spotId: v === '-' ? null : v })} options={spotOptions} className="min-w-[140px]" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Роль" value={label} maxLength={120} placeholder="Роль" onChange={(e) => setLabel(e.target.value)} className="min-w-0 grow" />
        {label !== x.label && (
          <Button size="sm" variant="primary" onClick={() => void send(url, { label }, 'Сохранено')}>
            Сохранить
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={x.visible} onCheckedChange={(v) => void send(url, { visible: v })} label="Видно игрокам" />
        <span className="grow" />
        <Button size="sm" variant={del ? 'danger' : 'ghost'} onBlur={() => setDel(false)} onClick={() => (del ? void send(`${url}/delete`, {}, 'Убрано') : setDel(true))}>
          {del ? 'Точно?' : 'Убрать'}
        </Button>
      </div>
    </div>
  );
}

/** Предложения Claude: каждое можно добавить по одному (сохранит человек) или закрыть все. */
function Ideas({ items, onAdd, onClose }: { items: { title: string; text: string }[]; onAdd: (i: number) => void; onClose: () => void }) {
  return (
    <div className="grid gap-2 rounded-control bg-surface-2 p-2.5">
      <div className="flex items-center">
        <strong className="grow font-ui text-[13.6px]">Черновик Claude — проверьте и добавьте нужное</strong>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Закрыть
        </Button>
      </div>
      {items.map((it, i) => (
        <div key={i} className="grid gap-1 border-t border-solid border-border pt-2 first-of-type:border-0">
          <span className="font-ui text-[13px] font-semibold">{it.title}</span>
          <span className="text-[14px]">{it.text}</span>
          <Button size="sm" className="justify-self-start" onClick={() => onAdd(i)}>
            Добавить
          </Button>
        </div>
      ))}
    </div>
  );
}
