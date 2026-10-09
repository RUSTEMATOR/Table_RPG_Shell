import { z } from 'zod';

// Атмосфера стола (этап 57): погода, время суток и фоновый звук. Задаёт мастер, видит и слышит стол.

export const WEATHERS = ['clear', 'rain', 'storm', 'snow', 'fog', 'ash'] as const;
export type Weather = (typeof WEATHERS)[number];
export const WEATHER_LABELS: Record<Weather, string> = { clear: 'Ясно', rain: 'Дождь', storm: 'Гроза', snow: 'Снег', fog: 'Туман', ash: 'Пепел' };

export const DAYTIMES = ['day', 'dawn', 'dusk', 'night'] as const;
export type Daytime = (typeof DAYTIMES)[number];
export const DAYTIME_LABELS: Record<Daytime, string> = { day: 'День', dawn: 'Рассвет', dusk: 'Сумерки', night: 'Ночь' };

export const AMBIENTS = ['auto', 'none', 'rain', 'wind', 'fire', 'night', 'sea'] as const;
export type Ambient = (typeof AMBIENTS)[number];
export const AMBIENT_LABELS: Record<Ambient, string> = { auto: 'По погоде', none: 'Тишина', rain: 'Дождь', wind: 'Ветер', fire: 'Костёр', night: 'Ночь', sea: 'Море' };

export const TableAtmosphereSchema = z.strictObject({ weather: z.enum(WEATHERS), daytime: z.enum(DAYTIMES), ambient: z.enum(AMBIENTS) });
export type TableAtmosphere = z.infer<typeof TableAtmosphereSchema>;
export const AtmosphereWriteSchema = TableAtmosphereSchema.partial();
export const DEFAULT_ATMOSPHERE: TableAtmosphere = { weather: 'clear', daytime: 'day', ambient: 'auto' };

/** «По погоде»: какой звук играет на самом деле. */
export function ambientFor(a: TableAtmosphere): Exclude<Ambient, 'auto'> {
  if (a.ambient !== 'auto') return a.ambient;
  if (a.weather === 'rain' || a.weather === 'storm') return 'rain';
  if (a.weather === 'snow' || a.weather === 'ash') return 'wind';
  if (a.daytime === 'night') return 'night';
  return 'none';
}
