import { lazy, Suspense, useEffect, useState } from 'react';
import { capabilities } from '../lib/capabilities.ts';
import { load, save } from '../lib/storage.ts';
import { cn } from '../lib/cn.ts';
import { MapView, type MapViewProps } from './MapView.tsx';

// Какой картой рисовать: пергамент или 3D (этап 26). 3D — по выбору зрителя, если есть WebGL2 и не облегчённый режим.
// 3D — отдельный ленивый чанк (three.js + сцена), модели — отдельным файлом.

const World3D = lazy(() => import('../maps3d/World3D.tsx').then((m) => ({ default: m.World3D })));

export type MapLook = '3d' | '2d';
// Пергамент — по умолчанию (решение Рустема: он красивее); 3D — по выбору, запоминается на устройстве.
const KEY = 'zg:map:3d';

/** Можно ли показать 3D на этом устройстве. */
export function can3d(): boolean {
  return capabilities.webgl2() && !capabilities.lite();
}

/** Выбор вида карты на устройстве: пергамент, пока зритель сам не выбрал 3D. */
export function useMapLook(): [MapLook, (v: MapLook) => void, boolean] {
  const able = can3d();
  const [look, setLook] = useState<MapLook>(() => (able && load(KEY) === '1' ? '3d' : '2d'));
  useEffect(() => {
    if (able) save(KEY, look === '3d' ? '1' : '0');
  }, [look, able]);
  return [able ? look : '2d', setLook, able];
}

export function MapStage({ look, ...props }: MapViewProps & { look: MapLook }) {
  if (look === '2d') return <MapView {...props} />;
  return (
    <Suspense fallback={<div className={cn('grid place-items-center bg-[#c9d6dc] font-ui text-[#4a5a60]', props.className)}>Строю мир…</div>}>
      <World3D {...props} />
    </Suspense>
  );
}

/** Переключатель «3D / Пергамент» для панели над картой. */
export function MapLookToggle({ look, onChange, className }: { look: MapLook; onChange: (v: MapLook) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(look === '3d' ? '2d' : '3d')}
      aria-label={look === '3d' ? 'Показать пергамент' : 'Показать 3D'}
      title={look === '3d' ? 'Пергаментная карта' : '3D-карта'}
      className={cn(
        'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-control border border-solid border-border bg-surface-2 px-3 font-ui text-[13.6px] font-semibold text-text',
        className,
      )}
    >
      {look === '3d' ? 'Пергамент' : '3D (проба)'}
    </button>
  );
}
