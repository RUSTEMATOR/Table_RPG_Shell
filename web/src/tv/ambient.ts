import type { Ambient } from '@zg/shared';
import { soundOutput } from './sound.ts';

// Фоновый звук стола (этап 57): синтез в Web Audio, без файлов. Шум с фильтрами — дождь, ветер, море; треск — костёр;
// короткие писки — сверчки ночью; низкий раскат — гром при грозе. Тише звуков кубиков. Играет, только когда звук стола «вкл.».

type Kind = Exclude<Ambient, 'auto'>;
const LEVEL = 0.22;
const FADE = 1.5;

let current: { kind: Kind; storm: boolean; stop: () => void } | null = null;

function noiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  // розовый шум (фильтр Пола Келлета, упрощённый) — мягче белого
  let b0 = 0,
    b1 = 0,
    b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return b;
}

function noise(ctx: AudioContext): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  return src;
}

function lfo(ctx: AudioContext, freq: number, depth: number, target: AudioParam): OscillatorNode {
  const o = ctx.createOscillator();
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
  return o;
}

/** Собрать звук; вернуть stop. */
function build(ctx: AudioContext, out: AudioNode, kind: Kind, storm: boolean): () => void {
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.gain.linearRampToValueAtTime(LEVEL, ctx.currentTime + FADE);
  bus.connect(out);
  const nodes: AudioScheduledSourceNode[] = [];
  const timers: number[] = [];
  const add = <T extends AudioScheduledSourceNode>(n: T) => (nodes.push(n), n);

  if (kind === 'rain' || kind === 'wind' || kind === 'sea') {
    const src = add(noise(ctx));
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    if (kind === 'rain') {
      f.type = 'highpass';
      f.frequency.value = 900;
      g.gain.value = 0.9;
    } else if (kind === 'wind') {
      f.type = 'bandpass';
      f.frequency.value = 500;
      f.Q.value = 0.8;
      g.gain.value = 0.9;
      add(lfo(ctx, 0.08, 350, f.frequency));
      add(lfo(ctx, 0.13, 0.35, g.gain));
    } else {
      f.type = 'lowpass';
      f.frequency.value = 700;
      g.gain.value = 0.6;
      add(lfo(ctx, 0.11, 0.55, g.gain)); // волна
    }
    src.connect(f).connect(g).connect(bus);
    src.start();
  }
  if (kind === 'fire') {
    // тихий гул и редкие щелчки
    const src = add(noise(ctx));
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f).connect(g).connect(bus);
    src.start();
    const crack = () => {
      const t = ctx.currentTime;
      const n = noise(ctx);
      const hf = ctx.createBiquadFilter();
      hf.type = 'highpass';
      hf.frequency.value = 1800 + Math.random() * 2000;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.6 + Math.random() * 0.6, t + 0.004);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.06);
      n.connect(hf).connect(e).connect(bus);
      n.start(t);
      n.stop(t + 0.15);
      timers.push(window.setTimeout(crack, 80 + Math.random() * 600));
    };
    crack();
  }
  if (kind === 'night') {
    // сверчки: короткие пачки писков около 4,5 кГц
    const chirp = () => {
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        o.frequency.value = 4300 + Math.random() * 400;
        const e = ctx.createGain();
        const s = t + i * 0.07;
        e.gain.setValueAtTime(0.0001, s);
        e.gain.exponentialRampToValueAtTime(0.12, s + 0.01);
        e.gain.exponentialRampToValueAtTime(0.0001, s + 0.05);
        o.connect(e).connect(bus);
        o.start(s);
        o.stop(s + 0.06);
      }
      timers.push(window.setTimeout(chirp, 400 + Math.random() * 1400));
    };
    chirp();
  }
  if (storm) {
    const thunder = () => {
      const t = ctx.currentTime;
      const n = noise(ctx);
      const lf = ctx.createBiquadFilter();
      lf.type = 'lowpass';
      lf.frequency.value = 160;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(1.6, t + 0.25);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      n.connect(lf).connect(e).connect(bus);
      n.start(t);
      n.stop(t + 3.6);
      timers.push(window.setTimeout(thunder, 9000 + Math.random() * 16000));
    };
    timers.push(window.setTimeout(thunder, 3000 + Math.random() * 6000));
  }
  return () => {
    timers.forEach((t) => window.clearTimeout(t));
    const t = ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + FADE);
    window.setTimeout(
      () => {
        nodes.forEach((n) => {
          try {
            n.stop();
          } catch {}
        });
        bus.disconnect();
      },
      FADE * 1000 + 100,
    );
  };
}

/** Поставить фоновый звук; тот же — ничего не делать; звук стола выключен — тишина. */
export function setAmbient(kind: Kind, storm: boolean): void {
  const o = soundOutput();
  if (current && (!o || current.kind !== kind || current.storm !== storm)) {
    current.stop();
    current = null;
  }
  if (!o || kind === 'none' || current) return;
  current = { kind, storm, stop: build(o.ctx, o.out, kind, storm) };
}
