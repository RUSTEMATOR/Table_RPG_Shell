import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAP_IDS, daysText, routesFrom, type MapId, type MapNote, type MapPublic, type ProposalPublic, type Route } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { load, save } from '../lib/storage.ts';
import { cn } from '../lib/cn.ts';
import { MapLookToggle, MapStage, useMapLook } from '../maps/MapStage.tsx';
import { MapHud } from '../maps/overlay/MapHud.tsx';
import { CityScreen, PlaceCard, usePlaceDetail } from '../maps/overlay/PlaceCard.tsx';
import type { MapCamera } from '../maps/camera.ts';
import { Button, Field, Sheet, Textarea, toast } from '../ui/index.ts';

const TITLES: Record<MapId, string> = { world: 'Мир', razdolye: 'Раздолье', frozen: 'Замёрзшие земли' };

/**
 * Карта у игрока: только открытое (остальное в тумане), маркер партии вживую, свои заметки.
 * Открытый регион со ссылкой ведёт на свою карту; «Мир» в пути — обратно. Заметки видит только сам игрок.
 */
export function PlayerMap({ active }: { active: boolean }) {
  const [mapId, setMapId] = useState<MapId>(() => {
    const v = load('zg:player:map');
    return MAP_IDS.find((m) => m === v) ?? 'world';
  });
  useEffect(() => save('zg:player:map', mapId), [mapId]);
  const [map, setMap] = useState<MapPublic | null>(null);
  const [camera, setCamera] = useState<MapCamera | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const [look, setLook, can3d] = useMapLook();
  const [edit, setEdit] = useState<{ note: MapNote | null; x: number; y: number } | null>(null);
  // карточка места и экран города (этап 27)
  const [card, setCard] = useState<string | null>(null);
  const [inCity, setInCity] = useState(false);
  useEffect(() => {
    setCard(null);
    setInCity(false);
  }, [mapId]);
  // путь и время в дороге (этап 28): от отряда по открытым дорогам
  const routeOf = useMemo(() => (map?.party ? routesFrom(mapId, map.party, map.roads, map.places) : null), [map, mapId]);
  const [proposal, setProposal] = useState<ProposalPublic | null>(null);
  const loadProposal = useCallback(
    async (announce: boolean) => {
      const r = await api<{ proposal: ProposalPublic | null }>('GET', `/api/player/maps/${mapId}/proposal`);
      if (!r.ok) return;
      setProposal((old) => {
        const now = r.data.proposal;
        if (announce && old?.status === 'pending' && now && now.placeId === old.placeId && now.status !== 'pending')
          now.status === 'accepted' ? toast(`Мастер принял: отряд идёт в ${now.placeName}`) : toast(`Мастер не принял предложение идти в ${now.placeName}`);
        return now;
      });
    },
    [mapId],
  );
  useEffect(() => {
    setProposal(null);
    void loadProposal(false);
  }, [loadProposal]);
  useSocketEvent('map:proposal.changed', (e) => e.mapId === mapId && void loadProposal(true));
  const proposeTo = async (placeId: string, cancel = false) => {
    const r = await api<{ proposal: ProposalPublic | null }>(
      'POST',
      cancel ? `/api/player/maps/${mapId}/propose/cancel` : `/api/player/maps/${mapId}/propose`,
      cancel ? {} : { placeId },
    );
    if (!r.ok) return toast.error('Не получилось');
    setProposal(r.data.proposal);
    if (!cancel) toast('Мастер увидит предложение');
  };

  const openPlace = (id: string) => {
    setCard(id);
    setInCity(false);
    const p = map?.places.find((x) => x.id === id);
    if (p && camera) camera.flyTo(p.x, p.y, Math.max(3, camera.view().zoom), { duration: 0.9 });
  };

  const reload = useCallback(async () => {
    const r = await api<MapPublic>('GET', `/api/player/maps/${mapId}`);
    if (r.ok) setMap(r.data);
  }, [mapId]);
  useEffect(() => {
    setMap(null);
    void reload();
  }, [reload]);
  useSocketEvent('map:changed', (e) => e.mapId === mapId && void reload());
  useSocketEvent('map:notes.changed', (e) => e.mapId === mapId && void reload());
  const conn = useConnection();
  useEffect(() => {
    if (conn === 'online') void reload();
  }, [conn, reload]);

  // Первый показ карты: к маркеру партии, иначе — вся карта.
  const centered = useRef<string | null>(null);
  useEffect(() => {
    if (!camera || !map || !active || centered.current === map.id) return;
    centered.current = map.id;
    if (map.party) camera.flyTo(map.party.x, map.party.y, 2.6, { instant: true });
  }, [camera, map, active]);

  const saveNote = async (text: string) => {
    if (!edit) return;
    const r = edit.note
      ? await api<MapPublic>('POST', `/api/player/maps/notes/${edit.note.id}`, { text })
      : await api<MapPublic>('POST', `/api/player/maps/${mapId}/notes`, { x: edit.x, y: edit.y, text });
    if (!r.ok) return toast.error(r.error === 'too_many' ? 'Слишком много заметок на этой карте' : 'Не сохранилось');
    setMap(r.data);
    setEdit(null);
  };
  const removeNote = async () => {
    if (!edit?.note) return;
    const r = await api<MapPublic>('POST', `/api/player/maps/notes/${edit.note.id}/delete`);
    if (!r.ok) return toast.error('Не удалилось');
    setMap(r.data);
    setEdit(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <nav aria-label="Путь по карте" className="flex min-w-0 grow items-center gap-1.5 font-ui text-sm text-muted">
          {mapId !== 'world' && (
            <>
              <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-link" onClick={() => setMapId('world')}>
                Мир
              </button>
              <span aria-hidden="true">›</span>
            </>
          )}
          <strong className="truncate font-['Cormorant_SC',Georgia,serif] text-xl font-bold text-text">{TITLES[mapId]}</strong>
        </nav>
        {can3d && <MapLookToggle look={look} onChange={setLook} />}
        <Button size="sm" variant={noteMode ? 'primary' : 'default'} aria-pressed={noteMode} onClick={() => setNoteMode((v) => !v)}>
          {noteMode ? 'Нажми на карту' : '+ Заметка'}
        </Button>
      </div>
      <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-card border border-solid border-border">
        {map ? (
          <MapStage
            key={look}
            look={look}
            data={map}
            mode="player"
            camera={setCamera}
            selected={card}
            route={card && !inCity ? (routeOf?.(card)?.path ?? null) : null}
            placeHint={(id) => {
              const r = routeOf?.(id);
              return r && r.units > 0 ? `${daysText(r.days.foot)} пешком` : null;
            }}
            {...(noteMode ? {} : { onPlace: openPlace })}
            onRegion={(r) => r.link && setMapId(r.link)}
            onPick={(x, y) => {
              if (!noteMode) return;
              setNoteMode(false);
              setEdit({ note: null, x, y });
            }}
            onNote={(n) => setEdit({ note: n, x: n.x, y: n.y })}
            className={cn('absolute inset-0', noteMode && 'cursor-crosshair')}
          >
            <MapHud camera={camera} places={map.places} regions={map.regions} party={map.party} onPlace={openPlace} />
          </MapStage>
        ) : (
          <div className="grid h-full place-items-center text-muted">Загрузка…</div>
        )}
        {card && !inCity && (
          <PlaceCard
            key={card}
            id={card}
            onClose={() => setCard(null)}
            onEnter={() => setInCity(true)}
            extra={(d) => (
              <TravelInfo
                route={routeOf ? routeOf(d.id) : null}
                hasParty={!!map?.party}
                proposal={proposal?.placeId === d.id ? proposal : null}
                onPropose={(cancel) => void proposeTo(d.id, cancel)}
              />
            )}
          />
        )}
        {card && inCity && (
          <PlayerCity
            id={card}
            at={map?.places.find((p) => p.id === card) ?? null}
            camera={camera}
            onClose={() => setInCity(false)}
            onGone={() => {
              setInCity(false);
              setCard(null);
            }}
          />
        )}
      </div>
      {map && map.regions.length === 0 && map.places.length === 0 && <p className="m-0 text-[13.6px] text-muted">Здесь пока туман: мастер откроет земли по ходу игры.</p>}
      <NoteSheet edit={edit} onClose={() => setEdit(null)} onSave={saveNote} onRemove={removeNote} />
    </div>
  );
}

/** Путь от отряда: дни пешком и верхом, предложение мастеру «идём сюда». */
function TravelInfo({ route, hasParty, proposal, onPropose }: { route: Route | null; hasParty: boolean; proposal: ProposalPublic | null; onPropose: (cancel: boolean) => void }) {
  if (!hasParty) return <p className="m-0 text-[13.6px] opacity-70">Где сейчас отряд, на этой карте не видно.</p>;
  if (!route) return null;
  if (route.units === 0) return <p className="m-0 text-[14px] font-semibold text-[#9fd3b0]">Отряд здесь.</p>;
  return (
    <div className="grid gap-2 rounded-[10px] bg-[rgba(243,236,217,.07)] p-3">
      <span className="text-[14px]">
        От отряда: <b>{daysText(route.days.foot)}</b> пешком · {daysText(route.days.horse)} верхом
        <span className="block text-[12.5px] opacity-65">{route.offroad ? 'часть пути — без дороги' : 'по дорогам'} · путь на карте золотой линией</span>
      </span>
      {proposal?.status === 'pending' ? (
        <div className="flex items-center gap-2 text-[13.6px]">
          <span className="grow">Предложено мастеру — ждём ответа.</span>
          <button
            type="button"
            onClick={() => onPropose(true)}
            className="cursor-pointer rounded-[8px] border border-solid border-[rgba(243,236,217,.3)] bg-transparent px-2.5 py-1 text-[13px] text-[#f3ecd9]"
          >
            Отменить
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onPropose(false)}
          className="cursor-pointer rounded-[9px] border border-solid border-[rgba(243,236,217,.35)] bg-transparent px-3 py-2 font-ui text-[14px] font-semibold text-[#f3ecd9] hover:bg-[rgba(243,236,217,.08)]"
        >
          {proposal?.status === 'accepted' ? 'Отряд идёт сюда · предложить снова' : 'Предложить мастеру идти сюда'}
        </button>
      )}
    </div>
  );
}

/** Экран города поверх карты; в 3D камера тем временем низко кружит над городом. */
function PlayerCity({ id, at, camera, onClose, onGone }: { id: string; at: { x: number; y: number } | null; camera: MapCamera | null; onClose: () => void; onGone: () => void }) {
  const { d, gone } = usePlaceDetail('/api/player/maps/places', id);
  useEffect(() => {
    if (gone) onGone();
  }, [gone]); // onGone — колбэк экрана
  useEffect(() => {
    if (!at || !camera?.orbit) return;
    camera.orbit(at.x, at.y, true);
    return () => camera.orbit?.(at.x, at.y, false);
  }, [at?.x, at?.y, camera]);
  if (!d) return null;
  return <CityScreen d={d} onClose={onClose} />;
}

function NoteSheet({ edit, onClose, onSave, onRemove }: { edit: { note: MapNote | null } | null; onClose: () => void; onSave: (text: string) => void; onRemove: () => void }) {
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setText(edit?.note?.text ?? '');
    setConfirm(false);
  }, [edit]);
  return (
    <Sheet open={!!edit} onOpenChange={(o) => !o && onClose()} title={edit?.note ? 'Заметка' : 'Новая заметка'} description="Её видишь только ты.">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSave(text.trim());
        }}
      >
        <Field label="Текст">{(id) => <Textarea id={id} rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} autoFocus />}</Field>
        <div className="flex gap-2">
          {edit?.note && (
            <Button variant={confirm ? 'danger' : 'ghost'} onClick={() => (confirm ? onRemove() : setConfirm(true))} onBlur={() => setConfirm(false)}>
              {confirm ? 'Точно удалить?' : 'Удалить'}
            </Button>
          )}
          <Button type="submit" variant="primary" className="grow" disabled={!text.trim()}>
            Сохранить
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
