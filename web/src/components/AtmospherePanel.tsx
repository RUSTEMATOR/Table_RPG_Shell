import { useEffect, useState } from 'react';
import { AMBIENTS, AMBIENT_LABELS, DAYTIMES, DAYTIME_LABELS, WEATHERS, WEATHER_LABELS, ambientFor, type TableAtmosphere } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';
import { Card, CardTitle, Field, Segmented, Select, toast } from '../ui/index.ts';

/** Атмосфера стола (этап 57): погода, время суток и фоновый звук. Применяется сразу. */
export function AtmospherePanel() {
  const [a, setA] = useState<TableAtmosphere | null>(null);
  useEffect(() => {
    void api<TableAtmosphere>('GET', '/api/gm/table/atmosphere').then((r) => r.ok && setA(r.data));
  }, []);
  useSocketEvent('gm:scenes.changed', () => void api<TableAtmosphere>('GET', '/api/gm/table/atmosphere').then((r) => r.ok && setA(r.data)));
  if (!a) return null;
  const set = async (patch: Partial<TableAtmosphere>) => {
    setA({ ...a, ...patch });
    const r = await api<TableAtmosphere>('POST', '/api/gm/table/atmosphere', patch);
    if (r.ok) setA(r.data);
    else toast.error('Не применилось');
  };
  const auto = ambientFor({ ...a, ambient: 'auto' });
  return (
    <Card>
      <CardTitle>Атмосфера</CardTitle>
      <Segmented
        label="Погода"
        value={a.weather}
        onChange={(v) => void set({ weather: v })}
        options={WEATHERS.map((w) => ({ value: w, label: WEATHER_LABELS[w] }))}
        className="flex-wrap"
      />
      <Segmented label="Время суток" value={a.daytime} onChange={(v) => void set({ daytime: v })} options={DAYTIMES.map((d) => ({ value: d, label: DAYTIME_LABELS[d] }))} />
      <Field label="Фоновый звук">
        {(id) => (
          <Select
            id={id}
            value={a.ambient}
            onValueChange={(v) => void set({ ambient: v as TableAtmosphere['ambient'] })}
            options={AMBIENTS.map((k) => ({ value: k, label: k === 'auto' ? `${AMBIENT_LABELS.auto} (сейчас: ${AMBIENT_LABELS[auto].toLowerCase()})` : AMBIENT_LABELS[k] }))}
            className="max-w-[320px]"
          />
        )}
      </Field>
      <p className="m-0 text-[13.6px] text-muted">
        Видно и слышно только на столе: погода и время суток — поверх сцены и карты, звук — если на столе включён звук. С «Анимация выкл.» — без движения.
      </p>
    </Card>
  );
}
