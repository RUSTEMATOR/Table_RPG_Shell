import { useEffect, useRef } from 'react';
import type { Daytime, Weather } from '@zg/shared';

type P = { x: number; y: number; vx: number; vy: number; r: number; a: number; life: number };

/**
 * Погода на столе (этап 57): canvas 2D поверх сцены и карты. still — без движения: лёгкая дымка без частиц.
 * Дождь — косые штрихи, гроза — дождь сильнее и вспышки, снег — хлопья, пепел — тлеющие искры вверх. Туман — CSS-слои.
 */
export function TvWeather({ weather, still }: { weather: Weather; still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const moving = !still && (weather === 'rain' || weather === 'storm' || weather === 'snow' || weather === 'ash');
  useEffect(() => {
    if (!moving) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let w = 0,
      h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const area = (w * h) / 10000;
    const count = Math.round(weather === 'storm' ? area * 4.5 : weather === 'rain' ? area * 3 : weather === 'snow' ? area * 1.4 : area * 0.6);
    const make = (fresh: boolean): P => {
      if (weather === 'ash')
        return {
          x: Math.random() * w,
          y: fresh ? h + 10 : Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -(0.3 + Math.random() * 0.7),
          r: 1 + Math.random() * 2.2,
          a: 0.4 + Math.random() * 0.6,
          life: 1,
        };
      if (weather === 'snow')
        return {
          x: Math.random() * w,
          y: fresh ? -10 : Math.random() * h,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 0.5 + Math.random() * 1.2,
          r: 1 + Math.random() * 2.6,
          a: 0.5 + Math.random() * 0.5,
          life: Math.random() * 6,
        };
      const fast = weather === 'storm' ? 1.5 : 1;
      return {
        x: Math.random() * (w + 200) - 100,
        y: fresh ? -20 : Math.random() * h,
        vx: -2.2 * fast,
        vy: (11 + Math.random() * 6) * fast,
        r: 0.8 + Math.random() * 0.8,
        a: 0.25 + Math.random() * 0.3,
        life: 0,
      };
    };
    const ps = Array.from({ length: count }, () => make(false));
    let raf = 0;
    let nextFlash = performance.now() + 6000 + Math.random() * 10000;
    const frame = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]!;
        p.x += p.vx;
        p.y += p.vy;
        if (weather === 'snow') p.x += Math.sin((p.life += 0.02)) * 0.4;
        if (weather === 'ash') {
          p.a *= 0.9985;
          p.x += Math.sin(t / 900 + i) * 0.2;
        }
        const out = p.y > h + 20 || p.y < -30 || p.x < -120 || p.x > w + 120 || p.a < 0.05;
        if (out) {
          ps[i] = make(true);
          continue;
        }
        if (weather === 'rain' || weather === 'storm') {
          ctx.strokeStyle = `rgba(200,215,230,${p.a})`;
          ctx.lineWidth = p.r;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 1.6, p.y + p.vy * 1.6);
          ctx.stroke();
        } else {
          ctx.fillStyle = weather === 'ash' ? `rgba(255,${120 + Math.round(p.a * 80)},60,${p.a})` : `rgba(245,248,255,${p.a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (weather === 'storm' && t > nextFlash && flash.current) {
        flash.current.animate([{ opacity: 0 }, { opacity: 0.75 }, { opacity: 0.1 }, { opacity: 0.55 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
        nextFlash = t + 7000 + Math.random() * 14000;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [moving, weather]);

  if (weather === 'clear') return null;
  const haze =
    weather === 'fog'
      ? 'linear-gradient(to top, rgba(210,215,220,.55), rgba(210,215,220,.15) 60%, rgba(210,215,220,.3))'
      : weather === 'snow'
        ? 'linear-gradient(to top, rgba(235,240,250,.25), transparent 50%)'
        : weather === 'ash'
          ? 'linear-gradient(to top, rgba(120,50,20,.28), rgba(40,20,10,.12) 60%, transparent)'
          : 'linear-gradient(to bottom, rgba(40,50,60,.32), rgba(40,50,60,.12))';
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0" style={{ background: haze }} />
      {weather === 'fog' && !still && (
        <>
          <div className="zg-fog absolute inset-[-10%] opacity-60 [animation:zg-fog-drift_60s_linear_infinite_alternate]" />
          <div className="zg-fog absolute inset-[-10%] opacity-40 [animation:zg-fog-drift_95s_linear_infinite_alternate-reverse]" />
        </>
      )}
      {moving && <canvas ref={ref} className="absolute inset-0 size-full" />}
      {weather === 'storm' && <div ref={flash} className="absolute inset-0 bg-[#e8eefc] opacity-0" />}
    </div>
  );
}

/** Время суток (этап 57): цветная накладка над сценой и картой. */
export function TvDaytime({ daytime }: { daytime: Daytime }) {
  if (daytime === 'day') return null;
  const style =
    daytime === 'night'
      ? { background: 'radial-gradient(ellipse at 50% 40%, rgba(20,30,70,.35), rgba(5,8,25,.78))', mixBlendMode: 'multiply' as const }
      : daytime === 'dusk'
        ? { background: 'linear-gradient(to bottom, rgba(110,60,140,.45), rgba(200,90,60,.35))', mixBlendMode: 'soft-light' as const }
        : { background: 'linear-gradient(to bottom, rgba(255,190,120,.4), rgba(255,230,180,.15))', mixBlendMode: 'soft-light' as const };
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 transition-[background] duration-[2000ms]" style={style} />;
}
