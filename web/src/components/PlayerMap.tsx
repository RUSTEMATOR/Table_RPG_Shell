import { useCallback, useEffect, useRef, useState } from 'react';
import { MAP_IDS, type MapId, type MapNote, type MapPublic } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useConnection, useSocketEvent } from '../lib/socket.ts';
import { load, save } from '../lib/storage.ts';
import { cn } from '../lib/cn.ts';
import { MapLookToggle, MapStage, useMapLook } from '../maps/MapStage.tsx';
import { MapHud } from '../maps/overlay/MapHud.tsx';
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
            onRegion={(r) => r.link && setMapId(r.link)}
            onPick={(x, y) => {
              if (!noteMode) return;
              setNoteMode(false);
              setEdit({ note: null, x, y });
            }}
            onNote={(n) => setEdit({ note: n, x: n.x, y: n.y })}
            className={cn('absolute inset-0', noteMode && 'cursor-crosshair')}
          >
            <MapHud camera={camera} places={map.places} regions={map.regions} party={map.party} />
          </MapStage>
        ) : (
          <div className="grid h-full place-items-center text-muted">Загрузка…</div>
        )}
      </div>
      {map && map.regions.length === 0 && map.places.length === 0 && <p className="m-0 text-[13.6px] text-muted">Здесь пока туман: мастер откроет земли по ходу игры.</p>}
      <NoteSheet edit={edit} onClose={() => setEdit(null)} onSave={saveNote} onRemove={removeNote} />
    </div>
  );
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
