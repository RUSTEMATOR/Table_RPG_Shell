import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type RefObject, type WheelEvent as RWheelEvent } from 'react';
import { animate, useMotionValue, type MotionValue } from 'motion/react';
import { MAP_H, MAP_W } from '@zg/shared';

// Камера карты: масштаб k и сдвиг (x, y) в пикселях экрана. Карта 1600×1100 рисуется один раз, камера двигает слой
// трансформацией (без перерисовки React на каждый кадр). Пальцы: один — сдвиг, два — масштаб; мышь: колесо — масштаб
// у курсора, перетаскивание — сдвиг. Во время жеста слой держит растр (will-change), после — перерисовывается чётко.

/** Камера карты снаружи: одна для пергамента и 3D. zoom — 1 (вся карта) … 5–6 (вблизи). */
export type MapCamera = {
  /** экран → карта */
  toMap: (clientX: number, clientY: number) => { x: number; y: number };
  /** плавно навести на точку карты с масштабом (1 — вся карта) */
  flyTo: (x: number, y: number, zoom: number, opts?: { duration?: number; instant?: boolean }) => void;
  zoomBy: (f: number) => void;
  /** куда смотрит камера сейчас: центр и масштаб */
  view: () => { x: number; y: number; zoom: number };
  /** 3D: повернуть на север и угол поворота (0 — север вверху) */
  north?: () => void;
  yaw?: () => number;
};

export type Camera = MapCamera & {
  k: MotionValue<number>;
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** идёт жест или полёт: слой можно держать растром */
  moving: boolean;
  /** минимальный масштаб (вся карта целиком) */
  fit: number;
  handlers: {
    onPointerDown: (e: RPointerEvent) => void;
    onPointerMove: (e: RPointerEvent) => void;
    onPointerUp: (e: RPointerEvent) => void;
    onPointerCancel: (e: RPointerEvent) => void;
    onWheel: (e: RWheelEvent) => void;
  };
  /** было ли последнее касание жестом (тогда клик по карте не считается выбором точки) */
  wasDrag: () => boolean;
};

const MAX_ZOOM = 5;

export function useCamera(box: RefObject<HTMLElement | null>, opts: { reducedMotion?: boolean } = {}): Camera {
  const k = useMotionValue(0.25);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [moving, setMoving] = useState(false);
  const [fit, setFit] = useState(0.25);
  const size = useRef({ w: 1, h: 1 });
  const fitRef = useRef(0.25);
  const ready = useRef(false);

  const clamp = useCallback((nk: number, nx: number, ny: number) => {
    const { w, h } = size.current;
    const kk = Math.min(fitRef.current * MAX_ZOOM, Math.max(fitRef.current, nk));
    const mw = MAP_W * kk,
      mh = MAP_H * kk;
    // карта меньше окна — по центру; больше — не уходит краем дальше края окна
    const cx = mw <= w ? (w - mw) / 2 : Math.min(0, Math.max(w - mw, nx));
    const cy = mh <= h ? (h - mh) / 2 : Math.min(0, Math.max(h - mh, ny));
    return { k: kk, x: cx, y: cy };
  }, []);
  const set = useCallback(
    (nk: number, nx: number, ny: number) => {
      const c = clamp(nk, nx, ny);
      k.set(c.k);
      x.set(c.x);
      y.set(c.y);
    },
    [clamp, k, x, y],
  );

  // Размер окна карты: пересчёт fit, первый показ — вся карта.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth || 1,
        h = el.clientHeight || 1;
      const prevFit = fitRef.current;
      size.current = { w, h };
      fitRef.current = Math.min(w / MAP_W, h / MAP_H);
      setFit(fitRef.current);
      if (!ready.current) {
        ready.current = true;
        set(fitRef.current, 0, 0);
      } else set((k.get() / prevFit) * fitRef.current, x.get(), y.get());
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, set, k, x, y]);

  const toMap = useCallback(
    (cx: number, cy: number) => {
      const r = box.current?.getBoundingClientRect();
      return { x: (cx - (r?.left ?? 0) - x.get()) / k.get(), y: (cy - (r?.top ?? 0) - y.get()) / k.get() };
    },
    [box, k, x, y],
  );

  const flight = useRef<{ stop: () => void }[]>([]);
  const stopFlight = () => {
    flight.current.forEach((a) => a.stop());
    flight.current = [];
  };
  const flyTo = useCallback(
    (mx: number, my: number, zoom: number, o: { duration?: number; instant?: boolean } = {}) => {
      stopFlight();
      const { w, h } = size.current;
      const nk = fitRef.current * Math.max(1, Math.min(MAX_ZOOM, zoom));
      const t = clamp(nk, w / 2 - mx * nk, h / 2 - my * nk);
      if (o.instant || opts.reducedMotion) {
        k.set(t.k);
        x.set(t.x);
        y.set(t.y);
        return;
      }
      setMoving(true);
      const d = o.duration ?? 1.2;
      const ease = [0.45, 0, 0.2, 1] as const;
      flight.current = [animate(k, t.k, { duration: d, ease }), animate(x, t.x, { duration: d, ease }), animate(y, t.y, { duration: d, ease })];
      void Promise.all(flight.current).then(() => setMoving(false));
    },
    [clamp, k, x, y, opts.reducedMotion],
  );

  const zoomAt = (f: number, px: number, py: number) => {
    const k0 = k.get();
    const nk = Math.min(fitRef.current * MAX_ZOOM, Math.max(fitRef.current, k0 * f));
    set(nk, px - ((px - x.get()) * nk) / k0, py - ((py - y.get()) * nk) / k0);
  };
  const zoomBy = (f: number) => {
    const { w, h } = size.current;
    zoomAt(f, w / 2, h / 2);
  };

  // ---- жесты ----
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x0: number; y0: number; tx: number; ty: number; dist?: number; k0?: number; mid?: { x: number; y: number }; moved: number } | null>(null);
  const dragged = useRef(false);
  const idle = useRef<number | null>(null);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const begin = () => {
    stopFlight();
    if (idle.current) window.clearTimeout(idle.current);
    setMoving(true);
  };
  const end = () => {
    if (idle.current) window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setMoving(false), 180);
  };
  const restart = () => {
    const list = [...pts.current.values()];
    if (list.length === 0) return (gesture.current = null);
    const a = list[0]!;
    if (list.length === 1) gesture.current = { x0: a.x, y0: a.y, tx: x.get(), ty: y.get(), moved: gesture.current?.moved ?? 0 };
    else {
      const b = list[1]!;
      gesture.current = {
        x0: a.x,
        y0: a.y,
        tx: x.get(),
        ty: y.get(),
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        k0: k.get(),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        moved: gesture.current?.moved ?? 0,
      };
    }
  };

  const handlers: Camera['handlers'] = {
    onPointerDown: (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      pts.current.set(e.pointerId, local(e));
      if (pts.current.size === 1) {
        dragged.current = false;
        gesture.current = null;
      }
      begin();
      restart();
    },
    onPointerMove: (e) => {
      if (!pts.current.has(e.pointerId)) return;
      pts.current.set(e.pointerId, local(e));
      const g = gesture.current;
      if (!g) return;
      const list = [...pts.current.values()];
      const a = list[0]!;
      if (list.length >= 2 && g.dist && g.k0 && g.mid) {
        const b = list[1]!;
        const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const nk = Math.min(fitRef.current * MAX_ZOOM, Math.max(fitRef.current, (g.k0 * dist) / g.dist));
        set(nk, mid.x - ((g.mid.x - g.tx) * nk) / g.k0, mid.y - ((g.mid.y - g.ty) * nk) / g.k0);
        dragged.current = true;
      } else {
        const dx = a.x - g.x0,
          dy = a.y - g.y0;
        g.moved = Math.max(g.moved, Math.hypot(dx, dy));
        if (g.moved > 6) dragged.current = true;
        set(k.get(), g.tx + dx, g.ty + dy);
      }
    },
    onPointerUp: (e) => {
      pts.current.delete(e.pointerId);
      restart();
      if (pts.current.size === 0) end();
    },
    onPointerCancel: (e) => {
      pts.current.delete(e.pointerId);
      restart();
      if (pts.current.size === 0) end();
    },
    onWheel: (e) => {
      begin();
      const p = local(e);
      if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
      else set(k.get(), x.get() - e.deltaX, y.get() - e.deltaY);
      end();
    },
  };

  const view = () => {
    const { w, h } = size.current;
    const kk = k.get();
    return { x: (w / 2 - x.get()) / kk, y: (h / 2 - y.get()) / kk, zoom: Math.min(MAX_ZOOM, Math.max(1, kk / fitRef.current)) };
  };
  return { k, x, y, moving, fit, toMap, flyTo, zoomBy, view, handlers, wasDrag: () => dragged.current };
}
