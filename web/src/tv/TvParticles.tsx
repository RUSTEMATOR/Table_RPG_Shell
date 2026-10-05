import { useEffect, useRef } from 'react';

type Spore = { x: number; y: number; r: number; vy: number; sway: number; phase: number; a: number };

/**
 * Фон стола: медленные зелёные споры (canvas 2D, без WebGL). Сами следят за собой: если после разгона средний кадр
 * дольше 33 мс две секунды подряд — зовут onSlow (стол уходит в облегчённый режим) и останавливаются.
 */
export function TvParticles({ onSlow }: { onSlow: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
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
    const count = Math.round(Math.min(90, (w * h) / 26000));
    const make = (y?: number): Spore => ({
      x: Math.random() * w,
      y: y ?? Math.random() * h,
      r: 1.2 + Math.random() * 2.8,
      vy: 6 + Math.random() * 14,
      sway: 8 + Math.random() * 22,
      phase: Math.random() * Math.PI * 2,
      a: 0.15 + Math.random() * 0.45,
    });
    const spores = Array.from({ length: count }, () => make());

    let raf = 0,
      last = performance.now(),
      started = last,
      slowFor = 0,
      avg = 16;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      // замер только после разгона и только пока вкладка на экране
      if (now - started > 3000 && !document.hidden) {
        avg = avg * 0.9 + (now - last) * 0.1;
        slowFor = avg > 33 ? slowFor + (now - last) : 0;
        if (slowFor > 2000) return onSlow();
      }
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (const s of spores) {
        s.y -= s.vy * dt;
        s.phase += dt * 0.6;
        if (s.y < -10) Object.assign(s, make(h + 10));
        const x = s.x + Math.sin(s.phase) * s.sway;
        const g = ctx.createRadialGradient(x, s.y, 0, x, s.y, s.r * 3);
        g.addColorStop(0, `rgba(142,240,176,${s.a})`);
        g.addColorStop(1, 'rgba(142,240,176,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, s.y, s.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [onSlow]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />;
}
