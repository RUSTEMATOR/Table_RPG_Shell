import * as THREE from 'three';
import { MAP_H, MAP_W } from '@zg/shared';

// Камера 3D-карты как в Mount & Blade: смотрит на точку земли с расстояния dist под наклоном, который зависит от
// расстояния (издали — почти сверху, вблизи — ниже, видно горизонт), и с поворотом yaw (0 — север вверху, как на пергаменте).
// Мышь: левая — тащить землю, правая (или Ctrl/Alt + левая) — повернуть и наклонить, колесо — к курсору.
// Пальцы: один — тащить, два — масштаб, поворот и сдвиг сразу. Клавиши: WASD/стрелки, Q/E, +/−.
// Масштаб наружу — как у пергамента: 1 — вся карта, до 6 — вблизи.

export type View = { x: number; y: number; zoom: number };

const FOV = 40;
const MIN_DIST = 70;
const PITCH_NEAR = 0.6; // ~34°
const PITCH_FAR = 1.22; // ~70°: издали почти как пергамент
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class StrategyCamera {
  readonly camera: THREE.PerspectiveCamera;
  x = MAP_W / 2;
  y = MAP_H / 2;
  dist = 1200;
  yaw = 0;
  tilt = 0;
  maxDist = 1400;
  interactive = true;
  /** медленный облёт (рад/с): экран города — камера кружит над городом */
  spin = 0;
  private groundY = 0;
  private w = 1;
  private h = 1;
  private ground: (x: number, y: number) => number;
  private changed: () => void;
  private el: HTMLElement;
  private flight: { from: View & { yaw: number }; to: { x: number; y: number; dist: number; yaw: number }; t: number; dur: number } | null = null;
  private vel = { x: 0, y: 0 };
  private keys = new Set<string>();
  private pts = new Map<number, { x: number; y: number; button: number }>();
  private gesture:
    | { kind: 'pan'; gx: number; gy: number }
    | { kind: 'rotate'; sx: number; sy: number; yaw: number; tilt: number }
    | { kind: 'pinch'; span: number; angle: number; dist: number; yaw: number; gx: number; gy: number }
    | null = null;
  private moved = 0;
  private dragged = false;
  private lastMove = { t: 0, x: 0, y: 0 };
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private off: (() => void)[] = [];
  /** точное попадание в землю (луч по сетке рельефа); без него — по плоскости */
  pickMesh: THREE.Object3D | null = null;

  constructor(el: HTMLElement, ground: (x: number, y: number) => number, changed: () => void) {
    this.el = el;
    this.ground = ground;
    this.changed = changed;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 8000);
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e));
    on('pointercancel', (e) => this.up(e));
    on('wheel', (e) => this.wheel(e), { passive: false });
    on('contextmenu', (e) => e.preventDefault());
    on('keydown', (e) => this.key(e, true));
    on('keyup', (e) => this.key(e, false));
    on('blur', () => this.keys.clear());
  }

  dispose() {
    this.off.forEach((f) => f());
  }

  setSize(w: number, h: number) {
    const first = this.w === 1 && this.h === 1;
    const zoom = this.view().zoom;
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.camera.aspect = this.w / this.h;
    this.maxDist = this.fitDist();
    this.dist = first ? this.maxDist : Math.max(MIN_DIST, this.maxDist / zoom);
    this.apply();
  }

  /** Расстояние, с которого вся доска карты (с наклоном PITCH_FAR, север вверху) целиком и плотно входит в кадр. */
  private fitDist(): number {
    const cam = new THREE.PerspectiveCamera(FOV, this.camera.aspect, 1, 100000);
    const corners = [
      [0, 0],
      [MAP_W, 0],
      [0, MAP_H],
      [MAP_W, MAP_H],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const v = new THREE.Vector3();
    const fits = (d: number) => {
      const hor = d * Math.cos(PITCH_FAR),
        ver = d * Math.sin(PITCH_FAR);
      cam.position.set(MAP_W / 2, ver, MAP_H / 2 + hor);
      cam.lookAt(MAP_W / 2, 0, MAP_H / 2);
      cam.updateMatrixWorld();
      return corners.every((c) => {
        v.copy(c).project(cam);
        return Math.abs(v.x) <= 0.97 && Math.abs(v.y) <= 0.97 && v.z < 1;
      });
    };
    let lo = 100,
      hi = 20000;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  /** Наклон: издали почти сверху, вблизи ниже. */
  private pitch(): number {
    const t = Math.min(1, Math.max(0, (this.dist - MIN_DIST) / (this.maxDist - MIN_DIST)));
    return Math.min(1.4, Math.max(0.45, PITCH_NEAR + (PITCH_FAR - PITCH_NEAR) * Math.sqrt(t) + this.tilt));
  }

  private clampTarget() {
    this.x = Math.min(MAP_W, Math.max(0, this.x));
    this.y = Math.min(MAP_H, Math.max(0, this.y));
    this.dist = Math.min(this.maxDist * 1.05, Math.max(MIN_DIST, this.dist));
  }

  /** Поставить камеру по x, y, dist, yaw. */
  apply() {
    this.clampTarget();
    const g = Math.max(0, this.ground(this.x, this.y));
    // высота цели сглажена: камера не прыгает над горами
    this.groundY += (g - this.groundY) * (this.flight || this.gesture ? 0.25 : 1);
    const p = this.pitch();
    const hor = this.dist * Math.cos(p),
      ver = this.dist * Math.sin(p);
    const c = this.camera;
    c.position.set(this.x + Math.sin(this.yaw) * hor, this.groundY + ver, this.y + Math.cos(this.yaw) * hor);
    c.lookAt(this.x, this.groundY, this.y);
    c.near = Math.max(1, this.dist * 0.05);
    c.far = this.dist * 3 + 2500;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    this.plane.constant = -this.groundY;
  }

  view(): View {
    return { x: this.x, y: this.y, zoom: Math.min(6, Math.max(1, this.maxDist / this.dist)) };
  }

  wasDrag() {
    return this.dragged;
  }

  /** Экран → точка карты (на земле). null — мимо земли. */
  toMap(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.pickMesh) {
      const hit = this.raycaster.intersectObject(this.pickMesh, false)[0];
      if (hit) return { x: hit.point.x, y: hit.point.z };
    }
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, p) ? { x: p.x, y: p.z } : null;
  }

  /** Точка на плоскости земли под точкой экрана (для перетаскивания — без неровностей рельефа). */
  private onPlane(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, p) ? { x: p.x, y: p.z } : null;
  }

  flyTo(x: number, y: number, zoom: number, o: { duration?: number; instant?: boolean; yaw?: number } = {}) {
    const to = { x, y, dist: Math.max(MIN_DIST, this.maxDist / Math.max(1, Math.min(6, zoom))), yaw: o.yaw ?? this.yaw };
    this.vel = { x: 0, y: 0 };
    if (o.instant) {
      this.flight = null;
      Object.assign(this, { x: to.x, y: to.y, dist: to.dist, yaw: to.yaw });
      this.apply();
      this.changed();
      return;
    }
    // поворот — по короткой дуге
    let dy = to.yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.flight = { from: { x: this.x, y: this.y, zoom: this.dist, yaw: this.yaw }, to: { ...to, yaw: this.yaw + dy }, t: 0, dur: Math.max(0.05, o.duration ?? 1.2) };
    this.changed();
  }

  zoomBy(f: number) {
    this.flyTo(this.x, this.y, this.view().zoom * f, { duration: 0.35 });
  }

  /** Повернуть на север. */
  north() {
    this.flyTo(this.x, this.y, this.view().zoom, { duration: 0.6, yaw: 0 });
    this.tilt = 0;
  }

  /** Шаг анимации: полёт, инерция, клавиши. true — ещё движется (нужен следующий кадр). */
  update(dt: number): boolean {
    let active = false;
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = ease(f.t);
      // расстояние — по логарифму: полёт издали к городу не «ныряет»
      this.x = f.from.x + (f.to.x - f.from.x) * k;
      this.y = f.from.y + (f.to.y - f.from.y) * k;
      this.dist = Math.exp(Math.log(f.from.zoom) + (Math.log(f.to.dist) - Math.log(f.from.zoom)) * k);
      this.yaw = f.from.yaw + (f.to.yaw - f.from.yaw) * k;
      if (f.t >= 1) this.flight = null;
      active = true;
    } else if (!this.gesture && (Math.abs(this.vel.x) > 0.5 || Math.abs(this.vel.y) > 0.5)) {
      this.x += this.vel.x * dt;
      this.y += this.vel.y * dt;
      const decay = Math.exp(-dt * 5);
      this.vel.x *= decay;
      this.vel.y *= decay;
      active = true;
    }
    if (this.spin && !this.gesture) {
      this.yaw += this.spin * dt;
      active = true;
    }
    if (this.keys.size && this.interactive) {
      const k = this.keys;
      const sp = this.dist * 0.9 * dt;
      let fx = 0,
        fy = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) fy -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fy += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
      // вперёд — от камеры к цели
      const s = Math.sin(this.yaw),
        c = Math.cos(this.yaw);
      this.x += (fx * c + fy * s) * sp;
      this.y += (-fx * s + fy * c) * sp;
      if (k.has('KeyQ')) this.yaw += 1.4 * dt;
      if (k.has('KeyE')) this.yaw -= 1.4 * dt;
      if (k.has('Equal') || k.has('NumpadAdd')) this.dist *= Math.exp(-1.6 * dt);
      if (k.has('Minus') || k.has('NumpadSubtract')) this.dist *= Math.exp(1.6 * dt);
      if (fx || fy || k.has('KeyQ') || k.has('KeyE') || k.has('Equal') || k.has('Minus') || k.has('NumpadAdd') || k.has('NumpadSubtract')) {
        this.flight = null;
        active = true;
      }
    }
    if (active) this.apply();
    else if (Math.abs(this.groundY - Math.max(0, this.ground(this.x, this.y))) > 0.05) {
      this.apply();
      active = true;
    }
    return active;
  }

  get busy(): boolean {
    return !!this.spin || !!this.flight || Math.abs(this.vel.x) > 0.5 || Math.abs(this.vel.y) > 0.5 || this.keys.size > 0;
  }

  // ---- ввод ----

  private local(e: { clientX: number; clientY: number }) {
    return { x: e.clientX, y: e.clientY };
  }

  private restart() {
    const list = [...this.pts.values()];
    if (!list.length) return (this.gesture = null);
    const a = list[0]!;
    if (list.length >= 2) {
      const b = list[1]!;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const g = this.onPlane(mid.x, mid.y) ?? { x: this.x, y: this.y };
      this.gesture = { kind: 'pinch', span: Math.hypot(b.x - a.x, b.y - a.y) || 1, angle: Math.atan2(b.y - a.y, b.x - a.x), dist: this.dist, yaw: this.yaw, gx: g.x, gy: g.y };
    } else if (a.button === 2) {
      this.gesture = { kind: 'rotate', sx: a.x, sy: a.y, yaw: this.yaw, tilt: this.tilt };
    } else {
      const g = this.onPlane(a.x, a.y);
      this.gesture = g ? { kind: 'pan', gx: g.x, gy: g.y } : null;
    }
  }

  private down(e: PointerEvent) {
    if (!this.interactive) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    this.el.focus({ preventScroll: true });
    this.el.setPointerCapture?.(e.pointerId);
    const button = e.pointerType === 'mouse' && (e.button === 2 || e.ctrlKey || e.altKey) ? 2 : 0;
    if (this.pts.size === 0) {
      this.moved = 0;
      this.dragged = false;
    }
    this.pts.set(e.pointerId, { ...this.local(e), button });
    this.flight = null;
    this.vel = { x: 0, y: 0 };
    this.lastMove = { t: performance.now(), x: this.x, y: this.y };
    this.restart();
  }

  private move(e: PointerEvent) {
    const p = this.pts.get(e.pointerId);
    if (!p || !this.gesture) return;
    const start = { x: p.x, y: p.y };
    p.x = e.clientX;
    p.y = e.clientY;
    const g = this.gesture;
    if (g.kind === 'pan') {
      this.moved += Math.hypot(p.x - start.x, p.y - start.y);
      if (this.moved > 6) this.dragged = true;
      const q = this.onPlane(p.x, p.y);
      if (!q) return;
      this.x += g.gx - q.x;
      this.y += g.gy - q.y;
      this.apply();
      // скорость для инерции
      const now = performance.now();
      const dt = (now - this.lastMove.t) / 1000;
      if (dt > 0.008) {
        this.vel = { x: (this.x - this.lastMove.x) / dt, y: (this.y - this.lastMove.y) / dt };
        this.lastMove = { t: now, x: this.x, y: this.y };
      }
    } else if (g.kind === 'rotate') {
      this.dragged = true;
      this.yaw = g.yaw - (p.x - g.sx) * 0.006;
      this.tilt = Math.min(0.3, Math.max(-0.35, g.tilt + (p.y - g.sy) * 0.003));
      this.apply();
    } else {
      this.dragged = true;
      const list = [...this.pts.values()];
      if (list.length < 2) return;
      const a = list[0]!,
        b = list[1]!;
      const span = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      this.dist = (g.dist * g.span) / span;
      this.yaw = g.yaw - (angle - g.angle);
      this.apply();
      const q = this.onPlane((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (q) {
        this.x += g.gx - q.x;
        this.y += g.gy - q.y;
        this.apply();
      }
    }
    this.changed();
  }

  private up(e: PointerEvent) {
    if (!this.pts.has(e.pointerId)) return;
    this.pts.delete(e.pointerId);
    // инерция — только если палец ещё двигался в момент отпускания
    if (this.gesture?.kind !== 'pan' || performance.now() - this.lastMove.t > 80 || this.pts.size > 0) this.vel = { x: 0, y: 0 };
    this.restart();
    this.changed();
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    if (!this.interactive) return;
    this.flight = null;
    this.vel = { x: 0, y: 0 };
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // трекпад: сдвиг двумя пальцами в сторону
      const k = this.dist / this.h;
      const s = Math.sin(this.yaw),
        c = Math.cos(this.yaw);
      this.x += (e.deltaX * c + e.deltaY * s) * k;
      this.y += (-e.deltaX * s + e.deltaY * c) * k;
    } else {
      const before = this.onPlane(e.clientX, e.clientY);
      this.dist *= Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      this.apply();
      const after = this.onPlane(e.clientX, e.clientY);
      if (before && after) {
        this.x += before.x - after.x;
        this.y += before.y - after.y;
      }
    }
    this.apply();
    this.changed();
  }

  private key(e: KeyboardEvent, down: boolean) {
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'];
    if (!keys.includes(e.code) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!this.interactive) return;
    e.preventDefault();
    // клавиши карты не доходят до горячих клавиш экрана
    e.stopPropagation();
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
    this.changed();
  }
}
