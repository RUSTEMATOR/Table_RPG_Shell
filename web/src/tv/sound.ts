import { useSyncExternalStore } from 'react';
import catalog from './sfx.json';
import { load, save } from '../lib/storage.ts';

// Звуки стола (Kenney, CC0; набор — tools/extract-audio). Web Audio: файлы качаются и декодируются при включении,
// дальше играют без задержки — стук кубика попадает в удар. Только на столе: у игроков и мастера звука нет.
// Браузер (особенно телевизора) даёт звук только после нажатия: включение — кнопкой на столе; после перезагрузки
// звук «ждёт нажатия» (blocked), пока по экрану не нажмут или не нажмут кнопку пульта.

export type Sfx = keyof typeof catalog.sounds;
export type SoundState = 'off' | 'on' | 'blocked';

const PREF = 'zg:table:sound';
const MASTER = 0.8;
const GAIN: Record<Sfx, number> = { roll: 0.7, knock: 0.55, crit: 0.55, fail: 0.85, swing: 0.6, hit: 0.85, flinch: 0.7, page: 0.45, door: 0.5 };
const MAX_VOICES = 2;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let wanted = load(PREF) === '1';
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const voices: AudioBufferSourceNode[] = [];
const last = new Map<Sfx, number>();
const listeners = new Set<() => void>();

// AAC понимают все (Safari, телевизоры, Chrome); Vorbis — запасной путь, если AAC нет.
const ext = typeof document !== 'undefined' && document.createElement('audio').canPlayType('audio/mp4; codecs="mp4a.40.2"') ? 'm4a' : 'ogg';

function state(): SoundState {
  if (!wanted) return 'off';
  return ctx && ctx.state === 'running' ? 'on' : 'blocked';
}
const notify = () => listeners.forEach((l) => l());

function context(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(ctx.destination);
  ctx.onstatechange = notify;
  return ctx;
}

function buffer(name: Sfx, n: number): Promise<AudioBuffer | null> {
  const url = `/sfx/${name}-${n}.${ext}?v=${catalog.v}`;
  let b = buffers.get(url);
  if (!b) {
    const c = context();
    b = c
      ? fetch(url)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((a) => c.decodeAudioData(a))
          .catch(() => null)
      : Promise.resolve(null);
    buffers.set(url, b);
  }
  return b;
}

/** Все звуки — сразу при включении (~170 КБ): первый бросок звучит вовремя. */
function warm(): void {
  for (const [name, count] of Object.entries(catalog.sounds) as [Sfx, number][]) for (let i = 1; i <= count; i++) void buffer(name, i);
}

/** Возобновить звук по любому нажатию (после перезагрузки страница не вправе начать звук сама). */
function resumeOnGesture(): void {
  const go = (e: Event) => {
    // нажатие на саму кнопку звука решает она (иначе звук включился бы здесь и тут же выключился её нажатием)
    if (!wanted || (e.target instanceof Element && e.target.closest('[data-sound-toggle]'))) return;
    void context()?.resume().then(notify);
    window.removeEventListener('pointerdown', go, true);
    window.removeEventListener('keydown', go, true);
  };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
}

if (wanted && typeof window !== 'undefined') {
  context();
  warm();
  resumeOnGesture();
}

/** Включить или выключить — только из обработчика нажатия (иначе браузер не даст звук). */
export function setSound(on: boolean): void {
  wanted = on;
  save(PREF, on ? '1' : '0');
  if (on) {
    const c = context();
    void c?.resume().then(notify);
    warm();
  } else {
    voices.splice(0).forEach((v) => v.stop());
    void ctx?.suspend();
  }
  notify();
}

/** Сыграть звук (случайный вариант, не тот же подряд). gain — громкость удара 0..1. Выключен или не загрузился — тихо ничего. */
export function play(name: Sfx, { gain = 1, delay = 0 }: { gain?: number; delay?: number } = {}): void {
  if (state() !== 'on' || !ctx || !master) return;
  const count = catalog.sounds[name];
  let n = 1 + Math.floor(Math.random() * count);
  if (count > 1 && n === last.get(name)) n = (n % count) + 1;
  last.set(name, n);
  const c = ctx,
    out = master;
  void buffer(name, n).then((b) => {
    if (!b || state() !== 'on') return;
    // не больше двух голосов: лишний стук кубика пропускаем, важный звук заменяет самый старый
    if (voices.length >= MAX_VOICES) {
      if (name === 'knock') return;
      voices.shift()?.stop();
    }
    const src = c.createBufferSource();
    src.buffer = b;
    const g = c.createGain();
    g.gain.value = GAIN[name] * Math.max(0, Math.min(1, gain));
    src.connect(g).connect(out);
    src.onended = () => {
      const i = voices.indexOf(src);
      if (i >= 0) voices.splice(i, 1);
    };
    voices.push(src);
    src.start(c.currentTime + delay / 1000);
  });
}

export function useSound(): SoundState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    state,
    () => 'off',
  );
}

/** Для фонового звука (этап 57): контекст и общий выход, если звук стола включён и разрешён; иначе null. */
export function soundOutput(): { ctx: AudioContext; out: GainNode } | null {
  return state() === 'on' && ctx && master ? { ctx, out: master } : null;
}
