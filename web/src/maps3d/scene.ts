import * as THREE from 'three';
import { MAP_H, MAP_W } from '@zg/shared';
import type { Art } from '../maps/MapArt.tsx';
import type { ViewPlace, ViewRegion } from '../maps/MapView.tsx';
import { fogUniforms, maskTexture, patchMaterial, type FogUniforms } from './fog.ts';
import { disposeGroup, instanceGroup, loadLibrary, makeMaterials, type Library, type Materials } from './models.ts';
import { fogClouds, landmarkClouds, natureOf } from './nature.ts';
import { radiusOf, settlementOf } from './settlements.ts';
import { StrategyCamera } from './strategyCamera.ts';
import { perfStats, timed } from '../maps/perf.ts';
import { buildHeights, fogMask, paintTerrain, WATER, type FogMask, type Heights } from './terrain.ts';

// Сцена 3D-карты (three.js без React): рельеф, вода, природа, поселения, туман, свет, камера. Рисует только когда нужно
// (requestRender), постоянно — пока что-то движется (полёт, инерция, переход тумана) или на столе (облака плывут).
// Подписи, фигурки, отряд и заметки — HTML поверх, привязаны к точкам карты (anchor): их положение пересчитывается
// после каждого кадра.

export type Mode = 'gm' | 'player' | 'table';
export type Projected = { x: number; y: number; px: number; depth: number; visible: boolean };
type Anchor = {
  el: HTMLElement;
  pos: () => { x: number; y: number; lift: number } | null;
  size?: number;
  min?: number;
  max?: number;
  fade?: (zoom: number) => number;
  /** подписи: не налезают друг на друга — важнее (больше) остаётся, остальные прячутся до приближения */
  priority?: () => number;
  far?: boolean;
};
/** Масштаб, ниже которого подписи короткие (без подзаголовка, мельче) — атрибут data-far у элемента. */
const FAR_ZOOM = 1.8;

const SKY = '#c9d6dc';
/** Размер поселений на карте: мир — в половину (у него крупнее масштаб). */
const SETTLEMENT_SCALE = { world: 0.5, razdolye: 1, frozen: 0.9 } as const;

export class MapScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: StrategyCamera;
  private mode: Mode;
  private shadows: boolean;
  private texSize: number;
  private u: FogUniforms;
  private sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  private lib: Library | null = null;
  private mats: Materials | null = null;
  private art: Art | null = null;
  heights: Heights | null = null;
  private terrain: THREE.Mesh | null = null;
  private terrainTex: THREE.CanvasTexture | null = null;
  private skirt: THREE.Mesh | null = null;
  private water: THREE.Mesh | null = null;
  private nature: THREE.Group | null = null;
  private landmarks: THREE.Group | null = null;
  private clouds: THREE.Group | null = null;
  private towns: THREE.Group | null = null;
  private townsKey = '';
  private paintKey = '';
  private fogKey = '';
  fog: FogMask = fogMask([], false);
  private fogFade = 1;
  private raf = 0;
  private dirty = true;
  private last = 0;
  private alive = true;
  private anchors = new Set<Anchor>();
  private frameListeners = new Set<() => void>();
  private size = { w: 1, h: 1 };
  private ro: ResizeObserver;
  private host: HTMLElement;
  /** движения без анимации (стол «Анимация выкл.», «уменьшить движение») */
  instant = false;

  constructor(host: HTMLElement, mode: Mode, opts: { touch: boolean }) {
    this.host = host;
    this.mode = mode;
    this.shadows = !opts.touch;
    this.texSize = opts.touch ? 1536 : 2048;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.touch ? 1.5 : 1.75));
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'absolute inset-0 block size-full';
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 2000, 6000);
    this.scene.add(new THREE.HemisphereLight('#e6eef5', '#6f6248', 1.25));
    this.sun.position.set(-300, 600, 400);
    this.sun.castShadow = this.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);

    this.u = fogUniforms(this.fog);
    this.u.uFogOn.value = mode === 'gm' ? 0 : 1;
    if (mode === 'table') this.u.uFogColor.value.set('#c9c4b8');

    this.cam = new StrategyCamera(
      host,
      (x, y) => this.heights?.at(x, y) ?? 0,
      () => this.requestRender(),
    );
    this.cam.interactive = mode !== 'table';
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  private resize() {
    const w = this.host.clientWidth || 1,
      h = this.host.clientHeight || 1;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.cam.setSize(w, h);
    this.requestRender();
  }

  requestRender() {
    this.dirty = true;
  }

  private holds = 0;
  /** Держать кадры, пока что-то движется поверх (фигурка идёт). Возвращает «отпустить». */
  hold(): () => void {
    this.holds++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.holds--;
      this.requestRender();
    };
  }

  onFrame(fn: () => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  /** HTML-элемент, привязанный к точке карты. size — размер в единицах карты (масштаб элемента по расстоянию). */
  anchor(a: Anchor): () => void {
    this.anchors.add(a);
    this.requestRender();
    return () => this.anchors.delete(a);
  }

  // ---- данные ----

  async setArt(art: Art) {
    if (this.art === art) return;
    this.art = art;
    this.heights = timed('рельеф', () => buildHeights(art));
    this.cam.apply();
    this.lib ??= await loadLibrary();
    if (!this.alive || this.art !== art) return;
    this.mats ??= makeMaterials(this.lib, this.u);
    this.buildTerrain();
    this.paintKey = '';
    this.townsKey = '';
    this.requestRender();
  }

  /** Сначала рельеф (setArt) — потом данные. Перерисовывается только изменившееся. */
  setData(d: { regions: ViewRegion[]; places: ViewPlace[]; roads: { d: string; open?: boolean }[] }) {
    if (!this.art || !this.heights || !this.lib || !this.mats) return;
    const gm = this.mode === 'gm';
    const regions = gm ? d.regions : d.regions.filter((r) => r.visible !== false);
    const roads = gm ? d.roads : d.roads.filter((r) => r.open !== false);
    const places = (gm ? d.places : d.places.filter((p) => p.visible !== false)).filter((p) => (p.kind as string) !== 'deleted');

    const paintKey = JSON.stringify([regions.map((r) => [r.id, r.visible !== false, r.fill]), roads.map((r) => [r.d.length, r.d.slice(0, 24), r.open !== false])]);
    if (paintKey !== this.paintKey) {
      this.paintKey = paintKey;
      const canvas = timed('текстура', () => paintTerrain(this.art!, regions, roads, gm, this.texSize));
      if (this.terrainTex) {
        this.terrainTex.image = canvas;
        this.terrainTex.needsUpdate = true;
      } else {
        this.terrainTex = new THREE.CanvasTexture(canvas);
        this.terrainTex.colorSpace = THREE.SRGBColorSpace;
        this.terrainTex.flipY = false;
        this.terrainTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        const m = this.terrain!.material as THREE.MeshStandardMaterial;
        m.map = this.terrainTex;
        m.needsUpdate = true;
      }
    }

    const fogKey = gm ? 'gm' : JSON.stringify(regions.map((r) => r.id).sort());
    if (fogKey !== this.fogKey) {
      const first = this.fogKey === '';
      this.fogKey = fogKey;
      this.fog = fogMask(regions, !gm);
      const t = maskTexture(this.fog);
      // старая маска → новая плавно (кроме первого показа)
      const old = this.u.uFogB.value;
      if (old !== this.u.uFogA.value) this.u.uFogA.value.dispose();
      this.u.uFogA.value = first || this.instant ? t : old;
      this.u.uFogB.value = t;
      this.u.uFogT.value = first || this.instant ? 1 : 0;
      this.fogFade = first || this.instant ? 1 : 0;
    }

    const townsKey = JSON.stringify(places.map((p) => [p.id, p.kind, Math.round(p.x), Math.round(p.y), p.ink]));
    if (townsKey !== this.townsKey) {
      this.townsKey = townsKey;
      timed('объекты', () => this.buildObjects(places));
    }
    this.requestRender();
  }

  private buildTerrain() {
    const H = this.heights!;
    const { gw, gh, step, data } = H;
    const pos = new Float32Array(gw * gh * 3);
    const uv = new Float32Array(gw * gh * 2);
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        const n = j * gw + i;
        pos[n * 3] = i * step;
        pos[n * 3 + 1] = data[n]!;
        pos[n * 3 + 2] = j * step;
        uv[n * 2] = (i * step) / MAP_W;
        uv[n * 2 + 1] = (j * step) / MAP_H;
      }
    const idx: number[] = [];
    for (let j = 0; j < gh - 1; j++)
      for (let i = 0; i < gw - 1; i++) {
        const a = j * gw + i,
          b = a + 1,
          c = a + gw,
          d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    if (this.terrain) {
      this.terrain.geometry.dispose();
      this.terrain.geometry = g;
    } else {
      const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, flatShading: true });
      patchMaterial(m, this.u, 'terrain');
      this.terrain = new THREE.Mesh(g, m);
      this.terrain.receiveShadow = this.shadows;
      this.scene.add(this.terrain);
    }
    this.cam.pickMesh = this.terrain;

    // край доски: стенки вниз от края рельефа
    const sk: number[] = [];
    const edge = (pts: [number, number][]) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const [i0, j0] = pts[k]!,
          [i1, j1] = pts[k + 1]!;
        const x0 = i0 * step,
          z0 = j0 * step,
          x1 = i1 * step,
          z1 = j1 * step;
        const y0 = data[j0 * gw + i0]!,
          y1 = data[j1 * gw + i1]!;
        sk.push(x0, y0, z0, x1, y1, z1, x0, -40, z0, x1, y1, z1, x1, -40, z1, x0, -40, z0);
      }
    };
    const top: [number, number][] = [],
      bottom: [number, number][] = [],
      left: [number, number][] = [],
      right: [number, number][] = [];
    for (let i = 0; i < gw; i++) {
      top.push([i, 0]);
      bottom.push([gw - 1 - i, gh - 1]);
    }
    for (let j = 0; j < gh; j++) {
      right.push([gw - 1, j]);
      left.push([0, gh - 1 - j]);
    }
    edge(top.reverse());
    edge(right.reverse());
    edge(bottom.reverse());
    edge(left.reverse());
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3));
    sg.computeVertexNormals();
    if (this.skirt) {
      this.skirt.geometry.dispose();
      this.skirt.geometry = sg;
    } else {
      const m = new THREE.MeshStandardMaterial({ color: '#6b5235', roughness: 1, side: THREE.DoubleSide, flatShading: true });
      patchMaterial(m, this.u, 'skirt');
      this.skirt = new THREE.Mesh(sg, m);
      this.scene.add(this.skirt);
    }

    if (!this.water) {
      const wg = new THREE.PlaneGeometry(MAP_W, MAP_H);
      wg.rotateX(-Math.PI / 2);
      wg.translate(MAP_W / 2, WATER, MAP_H / 2);
      this.water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: '#4d93b8', roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.82 }));
      this.water.receiveShadow = this.shadows;
      this.scene.add(this.water);
    }
  }

  private buildObjects(places: ViewPlace[]) {
    const lib = this.lib!,
      mats = this.mats!,
      H = this.heights!,
      art = this.art!;
    for (const g of [this.nature, this.towns, this.landmarks, this.clouds]) {
      if (!g) continue;
      this.scene.remove(g);
      disposeGroup(g);
    }
    // карта мира крупнее по масштабу — поселения на ней меньше, иначе столица занимает полкоролевства
    const k = SETTLEMENT_SCALE[art.id];
    const keep = places.map((p) => ({ x: p.x, y: p.y, r: radiusOf(p.kind) * k }));
    this.nature = instanceGroup(lib, natureOf(art, H, keep), mats.model, { shadows: this.shadows, depth: mats.depth });
    this.towns = instanceGroup(
      lib,
      places.flatMap((p) =>
        settlementOf(p, H).map((i) => {
          const x = p.x + (i.x - p.x) * k,
            y = p.y + (i.y - p.y) * k;
          // высота подошвы — та же относительно земли (лилии остаются на воде)
          return { ...i, x, y, base: i.base + H.at(x, y) - H.at(i.x, i.y), scale: i.scale * k };
        }),
      ),
      mats.model,
      { shadows: this.shadows, depth: mats.depth },
    );
    this.landmarks = instanceGroup(lib, landmarkClouds(art, H), mats.tinted, { shadows: false });
    this.scene.add(this.nature, this.towns, this.landmarks);
    if (this.mode !== 'gm') {
      this.clouds = instanceGroup(lib, fogClouds(H), mats.cloud, { shadows: false });
      this.scene.add(this.clouds);
    } else this.clouds = null;
  }

  // ---- путь (этап 28) ----

  private route: THREE.Mesh | null = null;

  /** Предпросмотр пути: золотая лента по земле. null — убрать. */
  setRoute(points: [number, number][] | null) {
    if (this.route) {
      this.scene.remove(this.route);
      this.route.geometry.dispose();
      (this.route.material as THREE.Material).dispose();
      this.route = null;
    }
    if (points && points.length > 1 && this.heights) {
      const H = this.heights;
      // точки погуще: лента ложится на холмы, а не режет их
      const dense: [number, number][] = [];
      for (let i = 1; i < points.length; i++) {
        const [x0, y0] = points[i - 1]!;
        const [x1, y1] = points[i]!;
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
        for (let k = 0; k < n; k++) dense.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
      }
      dense.push(points[points.length - 1]!);
      const W = 2.6;
      const pos: number[] = [];
      const idx: number[] = [];
      dense.forEach(([x, y], i) => {
        const [ax, ay] = dense[Math.max(0, i - 1)]!;
        const [bx, by] = dense[Math.min(dense.length - 1, i + 1)]!;
        const l = Math.hypot(bx - ax, by - ay) || 1;
        const nx = -(by - ay) / l,
          ny = (bx - ax) / l;
        const h = Math.max(H.at(x, y), WATER) + 0.9;
        pos.push(x + nx * W, h, y + ny * W, x - nx * W, h, y - ny * W);
        if (i > 0) {
          const a = (i - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      const m = new THREE.MeshBasicMaterial({
        color: '#e0b23a',
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });
      this.route = new THREE.Mesh(g, m);
      this.route.renderOrder = 2;
      this.scene.add(this.route);
    }
    this.requestRender();
  }

  // ---- кадр ----

  private loop(now: number) {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    let active = this.cam.update(dt);
    if (this.fogFade < 1) {
      this.fogFade = Math.min(1, this.fogFade + dt / 1.6);
      this.u.uFogT.value = this.fogFade * this.fogFade * (3 - 2 * this.fogFade);
      active = true;
    }
    if (this.mode === 'table' && !this.instant) {
      this.u.uTime.value = now / 1000;
      active = true;
    }
    if (this.holds > 0) active = true;
    if (!active && !this.dirty) return;
    this.dirty = false;
    this.render();
  }

  private render() {
    const c = this.cam;
    // тень — вокруг того, куда смотрим
    if (this.shadows) {
      const s = Math.min(900, Math.max(120, c.dist * 0.75));
      const sc = this.sun.shadow.camera;
      sc.left = -s;
      sc.right = s;
      sc.top = s;
      sc.bottom = -s;
      sc.near = 10;
      sc.far = 2400;
      sc.updateProjectionMatrix();
      this.sun.target.position.set(c.x, 0, c.y);
      this.sun.position.set(c.x - 380, 760, c.y + 420);
    }
    // дымка у горизонта: вблизи заметна, издали карта видна целиком
    const f = this.scene.fog as THREE.Fog;
    f.near = c.dist * 1.25;
    f.far = c.dist * 3.4 + 400;
    this.renderer.render(this.scene, c.camera);
    perfStats.calls = this.renderer.info.render.calls;
    perfStats.triangles = this.renderer.info.render.triangles;
    this.placeAnchors();
    this.frameListeners.forEach((fn) => fn());
  }

  private v = new THREE.Vector3();

  project(x: number, y: number, lift = 0): Projected {
    const H = this.heights;
    const base = Math.max(H ? H.at(x, y) : 0, WATER);
    const fogged = this.fog.at(x, y);
    // под туманом земля опущена — подписи и фигурки тоже
    const y0 = fogged > 0.15 ? base * (1 - Math.min(1, fogged)) + 4 * Math.min(1, fogged) : base;
    const cam = this.cam.camera;
    const v = this.v.set(x, y0 + lift, y).applyMatrix4(cam.matrixWorldInverse);
    const depth = -v.z;
    v.applyMatrix4(cam.projectionMatrix);
    const t = Math.tan((cam.fov * Math.PI) / 360);
    return {
      x: (v.x * 0.5 + 0.5) * this.size.w,
      y: (-v.y * 0.5 + 0.5) * this.size.h,
      px: this.size.h / (2 * t * Math.max(1, depth)),
      depth,
      visible: depth > 0 && v.x > -1.2 && v.x < 1.2 && v.y > -1.3 && v.y < 1.3,
    };
  }

  private placeAnchors() {
    const zoom = this.cam.view().zoom;
    const far = zoom < FAR_ZOOM;
    type Item = { a: Anchor; x: number; y: number; s: number; fade: number; pri: number };
    const shown: Item[] = [];
    for (const a of this.anchors) {
      if (a.priority && a.far !== far) {
        a.far = far;
        a.el.toggleAttribute('data-far', far);
      }
      const pos = a.pos();
      const p = pos ? this.project(pos.x, pos.y, pos.lift) : null;
      const fade = a.fade ? a.fade(zoom) : 1;
      if (!p || !p.visible || fade <= 0) {
        a.el.style.visibility = 'hidden';
        continue;
      }
      const s = a.size ? Math.min(a.max ?? 4, Math.max(a.min ?? 0.2, (p.px * a.size) / 100)) : 1;
      shown.push({ a, x: p.x, y: p.y, s, fade, pri: a.priority?.() ?? Infinity });
    }
    // подписи: по важности, каждая — только если не налезает на уже поставленные (элемент стоит над точкой, по центру)
    const boxes: [number, number, number, number][] = [];
    shown.sort((p, q) => q.pri - p.pri);
    for (const it of shown) {
      if (it.a.priority) {
        const c = it.a.el.firstElementChild as HTMLElement | null;
        const w = c?.offsetWidth ?? 0,
          h = c?.offsetHeight ?? 0;
        const box: [number, number, number, number] = [it.x - w / 2 - 3, it.y - h - 2, it.x + w / 2 + 3, it.y + 2];
        if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) {
          it.a.el.style.visibility = 'hidden';
          continue;
        }
        boxes.push(box);
      }
      const a = it.a;
      a.el.style.visibility = 'visible';
      a.el.style.opacity = it.fade >= 1 ? '' : String(it.fade);
      a.el.style.transform = `translate3d(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px, 0) scale(${it.s.toFixed(3)})`;
      a.el.style.zIndex = String(Math.round(it.y));
    }
  }

  dispose() {
    this.alive = false;
    perfStats.calls = undefined;
    perfStats.triangles = undefined;
    perfStats.build = {};
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cam.dispose();
    for (const g of [this.nature, this.towns, this.landmarks, this.clouds]) if (g) disposeGroup(g);
    this.terrain?.geometry.dispose();
    this.skirt?.geometry.dispose();
    this.water?.geometry.dispose();
    this.terrainTex?.dispose();
    this.setRoute(null);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
