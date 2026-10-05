import { useCallback, useEffect, useMemo, useState } from 'react';
import { MAP_IDS, PLACE_KINDS, PLACE_KIND_LABELS, type GmMapPlace, type GmMapView, type MapId, type PlaceKind } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { load, save } from '../lib/storage.ts';
import { cn } from '../lib/cn.ts';
import { MapView, ZoomButtons, type MapViewData } from '../maps/MapView.tsx';
import type { Camera } from '../maps/camera.ts';
import { preloadArt } from '../maps/MapArt.tsx';
import { Badge, Button, Card, CardTitle, Field, Input, Segmented, Select, Sheet, Switch, Textarea, toast } from '../ui/index.ts';

const TITLES: Record<MapId, string> = { world: 'Мир', razdolye: 'Раздолье', frozen: 'Замёрзшие земли' };
type Tool = 'select' | 'place' | 'party';

/**
 * Карты у мастера: видно всё — скрытое заштриховано и бледнее. Открыть/закрыть регион и место, редактор мест
 * (нажать «Новое место» и точку на карте; перетащить — переставить), маркер партии, показ на столе с наездом камеры.
 */
export function GmMaps() {
  const [mapId, setMapId] = useState<MapId>(() => {
    const v = load('zg:gm:map');
    return MAP_IDS.find((m) => m === v) ?? 'world';
  });
  useEffect(() => save('zg:gm:map', mapId), [mapId]);
  // соседние карты — заранее: переход по ссылке региона без ожидания
  useEffect(() => MAP_IDS.forEach((m) => void preloadArt(m)), []);
  const [view, setView] = useState<GmMapView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [camera, setCamera] = useState<Camera | null>(null);
  const [panel, setPanel] = useState(false);
  // Лист — только когда боковой панели нет на экране (узкое окно).
  const openPanel = () => {
    const side = document.querySelector<HTMLElement>('aside[aria-label="Регионы и места"]');
    if (!side || side.offsetParent === null) setPanel(true);
  };

  const reload = useCallback(async () => {
    const r = await api<GmMapView>('GET', `/api/gm/maps/${mapId}`);
    if (r.ok) setView(r.data);
  }, [mapId]);
  useEffect(() => {
    setView(null);
    setSelected(null);
    void reload();
  }, [reload]);
  useSocketEvent('gm:map.changed', (e) => e.mapId === mapId && void reload());
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void reload();
  }, [conn, reload]);

  const data: MapViewData | null = useMemo(
    () =>
      view && {
        id: view.id,
        regions: view.regions,
        places: view.places,
        roads: view.roads,
        party: view.party && view.party.mapId === view.id ? view.party : null,
        notes: [],
      },
    [view],
  );
  const place = view?.places.find((p) => p.id === selected) ?? null;

  const post = async (path: string, body: unknown, ok?: string) => {
    const r = await api<GmMapView | { id: string; map: GmMapView } | { ok: true }>('POST', path, body);
    if (!r.ok) {
      toast.error('Не сохранилось');
      return null;
    }
    if ('map' in r.data) setView(r.data.map);
    else if ('regions' in r.data) setView(r.data);
    if (ok) toast(ok);
    return r.data;
  };

  const pick = async (x: number, y: number) => {
    if (tool === 'place') {
      const res = await post(`/api/gm/maps/${mapId}/places`, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, kind: 'mark', name: '', visible: false });
      if (res && 'id' in res) {
        setSelected(res.id);
        openPanel();
      }
      setTool('select');
    } else if (tool === 'party') {
      await post('/api/gm/maps/party', { mapId, x, y, visible: true }, 'Партия здесь');
      void reload();
      setTool('select');
    } else setSelected(null);
  };

  const showOnTable = async (focus: { x: number; y: number; zoom: number } | null) => {
    await post('/api/gm/table/map', { mapId, focus }, focus ? 'Стол наезжает на это место' : 'Карта на столе');
    void reload();
  };
  const currentFocus = () => {
    if (!camera) return null;
    const el = document.getElementById('gm-map-box');
    const r = el?.getBoundingClientRect();
    if (!r) return null;
    const c = camera.toMap(r.left + r.width / 2, r.top + r.height / 2);
    return { x: Math.round(c.x), y: Math.round(c.y), zoom: Math.min(6, Math.max(1, Math.round((camera.k.get() / camera.fit) * 10) / 10)) };
  };
  const onTable = view?.table?.mapId === mapId;

  return (
    <div className="grid gap-4">
      <Card className="gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="grow">Карты</CardTitle>
          <Segmented label="Карта" value={mapId} onChange={setMapId} options={MAP_IDS.map((m) => ({ value: m, label: TITLES[m] }))} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Инструмент"
            value={tool}
            onChange={setTool}
            options={[
              { value: 'select', label: 'Выбор' },
              { value: 'place', label: 'Новое место' },
              { value: 'party', label: 'Партия' },
            ]}
          />
          <span className="text-[13.6px] text-muted">
            {tool === 'place' ? 'Нажмите на карту, где поставить место.' : tool === 'party' ? 'Нажмите на карту, где сейчас партия.' : 'Место можно перетащить.'}
          </span>
          <span className="grow" />
          {onTable && <Badge tone="ok">На столе</Badge>}
          <Button size="sm" onClick={() => showOnTable(currentFocus())}>
            На стол: этот вид
          </Button>
          <Button size="sm" variant={onTable ? 'default' : 'primary'} onClick={() => showOnTable(null)}>
            На стол: вся карта
          </Button>
          {view?.table && (
            <Button size="sm" variant="ghost" onClick={() => post('/api/gm/table/map', { mapId: null, focus: null }, 'Карта убрана со стола').then(() => reload())}>
              Убрать со стола
            </Button>
          )}
          <Button size="sm" className="@4xl/gmmap:hidden" onClick={() => setPanel(true)}>
            Список
          </Button>
        </div>
      </Card>

      <div className="@container/gmmap">
        <div className="grid items-start gap-4 @4xl/gmmap:grid-cols-[minmax(0,1fr)_340px]">
          <div id="gm-map-box" className="relative overflow-hidden rounded-card border border-solid border-border">
            {data ? (
              <MapView
                data={data}
                mode="gm"
                selected={selected}
                onPlace={(id) => {
                  setSelected(id);
                  openPanel();
                }}
                onPlaceMove={(id, x, y) => void post(`/api/gm/maps/places/${id}`, { x, y })}
                onPick={pick}
                onRegion={(r) => r.link && setMapId(r.link)}
                camera={setCamera}
                className={cn('h-[min(72dvh,820px)] min-h-[420px]', tool !== 'select' && 'cursor-crosshair')}
              >
                <ZoomButtons camera={camera} />
              </MapView>
            ) : (
              <div className="grid h-[min(72dvh,820px)] min-h-[420px] place-items-center text-muted">Загрузка…</div>
            )}
          </div>
          <aside aria-label="Регионы и места" className="sticky top-[76px] hidden max-h-[calc(100dvh-92px)] overflow-y-auto overscroll-contain @4xl/gmmap:block">
            {view && <SidePanel view={view} place={place} onSelect={(id) => select(id)} post={post} onDone={() => setSelected(null)} showOnTable={showOnTable} />}
          </aside>
        </div>
      </div>
      <Sheet open={panel} onOpenChange={setPanel} title={place ? place.name || PLACE_KIND_LABELS[place.kind] : 'Регионы и места'}>
        {view && (
          <SidePanel
            view={view}
            place={place}
            onSelect={(id) => select(id)}
            post={post}
            onDone={() => {
              setSelected(null);
              setPanel(false);
            }}
            showOnTable={showOnTable}
          />
        )}
      </Sheet>
    </div>
  );

  function select(id: string) {
    setSelected(id);
    const p = view?.places.find((x) => x.id === id);
    if (p) camera?.flyTo(p.x, p.y, 2.5, { duration: 0.8 });
  }
}

type Post = (path: string, body: unknown, ok?: string) => Promise<unknown>;

function SidePanel({
  view,
  place,
  onSelect,
  post,
  onDone,
  showOnTable,
}: {
  view: GmMapView;
  place: GmMapPlace | null;
  onSelect: (id: string) => void;
  post: Post;
  onDone: () => void;
  showOnTable: (f: { x: number; y: number; zoom: number } | null) => void;
}) {
  if (place) return <PlaceEditor key={place.id} place={place} post={post} onDone={onDone} showOnTable={showOnTable} />;
  return <Lists view={view} onSelect={onSelect} post={post} />;
}

function Lists({ view, onSelect, post }: { view: GmMapView; onSelect: (id: string) => void; post: Post }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'hidden'>('all');
  const places = view.places.filter(
    (p) => (filter === 'all' || (filter === 'open' ? p.visible : !p.visible)) && (!q || (p.name || PLACE_KIND_LABELS[p.kind]).toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <div className="grid gap-4">
      <Card className="gap-2">
        <h3 className="m-0">Регионы</h3>
        <ul className="m-0 grid list-none gap-1 p-0">
          {view.regions.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-sm border border-solid border-border" style={{ background: r.fill ?? 'transparent' }} />
              <span className={cn('grow', !r.visible && 'text-muted')}>{r.name}</span>
              <Switch
                checked={r.visible}
                onCheckedChange={(v) => void post(`/api/gm/maps/regions/${r.id}`, { visible: v }, v ? `«${r.name}» открыт` : `«${r.name}» скрыт`)}
                label={`${r.name}: открыт игрокам`}
                hideLabel
              />
            </li>
          ))}
        </ul>
        {view.party && (
          <div className="flex items-center gap-2 border-t border-solid border-border pt-2">
            <span className="grow">
              Партия: {TITLES[view.party.mapId]}
              {view.party.mapId !== view.id && <span className="text-muted"> (другая карта)</span>}
            </span>
            <Switch
              checked={view.party.visible}
              onCheckedChange={(v) => void post('/api/gm/maps/party', { ...view.party!, visible: v }, v ? 'Маркер партии виден' : 'Маркер партии спрятан')}
              label="видна"
            />
          </div>
        )}
      </Card>
      <Card className="gap-2">
        <div className="flex items-center gap-2">
          <h3 className="m-0 grow">Места</h3>
          <Segmented
            label="Какие места"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'open', label: 'Открытые' },
              { value: 'hidden', label: 'Скрытые' },
            ]}
          />
        </div>
        <Input aria-label="Поиск места" placeholder="Найти место" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="m-0 grid list-none p-0">
          {places.map((p) => (
            <li key={p.id} className="flex items-center gap-2 border-b border-solid border-border py-1.5 last:border-0">
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className={cn('grow cursor-pointer border-0 bg-transparent p-0 text-left font-ui text-[15px]', !p.visible && 'text-muted')}
              >
                {p.name || <i>{PLACE_KIND_LABELS[p.kind]}</i>}
                {p.noteGm && <span className="ml-1 text-xs text-muted">· заметка</span>}
              </button>
              <Switch
                checked={p.visible}
                onCheckedChange={(v) => void post(`/api/gm/maps/places/${p.id}`, { visible: v })}
                label={`${p.name || PLACE_KIND_LABELS[p.kind]}: открыто игрокам`}
                hideLabel
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function PlaceEditor({
  place,
  post,
  onDone,
  showOnTable,
}: {
  place: GmMapPlace;
  post: Post;
  onDone: () => void;
  showOnTable: (f: { x: number; y: number; zoom: number } | null) => void;
}) {
  const [name, setName] = useState(place.name);
  const [subtitle, setSubtitle] = useState(place.subtitle);
  const [noteGm, setNoteGm] = useState(place.noteGm);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = name !== place.name || subtitle !== place.subtitle || noteGm !== place.noteGm;
  const url = `/api/gm/maps/places/${place.id}`;
  return (
    <Card className="gap-3">
      <div className="flex items-center gap-2">
        <h3 className="m-0 grow">{place.name || PLACE_KIND_LABELS[place.kind]}</h3>
        <Button variant="ghost" size="sm" onClick={onDone}>
          К списку
        </Button>
      </div>
      <Switch checked={place.visible} onCheckedChange={(v) => void post(url, { visible: v }, v ? 'Место открыто игрокам' : 'Место скрыто')} label="Видно игрокам и столу" />
      <Field label="Название">{(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}</Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Вид">
          {(id) => (
            <Select
              id={id}
              value={place.kind}
              onValueChange={(v) => void post(url, { kind: v as PlaceKind })}
              options={PLACE_KINDS.map((k) => ({ value: k, label: PLACE_KIND_LABELS[k] }))}
            />
          )}
        </Field>
        <Field label="Подпись">
          {(id) => (
            <Select
              id={id}
              value={place.side}
              onValueChange={(v) => void post(url, { side: v })}
              options={[
                { value: 'r', label: 'справа' },
                { value: 'l', label: 'слева' },
                { value: 'b', label: 'снизу' },
              ]}
            />
          )}
        </Field>
      </div>
      <Field label="Подзаголовок (видят игроки)">
        {(id) => <Input id={id} value={subtitle} maxLength={200} onChange={(e) => setSubtitle(e.target.value)} placeholder="например, гильдия…" />}
      </Field>
      <Field label="Заметка мастера (никуда не уходит)">{(id) => <Textarea id={id} rows={3} value={noteGm} maxLength={4000} onChange={(e) => setNoteGm(e.target.value)} />}</Field>
      {dirty && (
        <Button variant="primary" onClick={() => void post(url, { name, subtitle, noteGm }, 'Место сохранено')}>
          Сохранить
        </Button>
      )}
      <div className="flex flex-wrap gap-2 border-t border-solid border-border pt-3">
        <Button size="sm" onClick={() => showOnTable({ x: place.x, y: place.y, zoom: 3 })}>
          На стол: наехать сюда
        </Button>
        <Button
          size="sm"
          variant={confirmDel ? 'danger' : 'ghost'}
          className="ml-auto"
          onBlur={() => setConfirmDel(false)}
          onClick={async () => {
            if (!confirmDel) return setConfirmDel(true);
            await post(`${url}/delete`, {}, 'Место удалено');
            onDone();
          }}
        >
          {confirmDel ? 'Точно удалить?' : 'Удалить'}
        </Button>
      </div>
      <p className="m-0 text-[13px] text-muted">Чтобы переставить место, перетащите его на карте.</p>
    </Card>
  );
}
