import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { UnitId } from '@zg/shared';
import catalog from './units.json';

// 3D-противники на 3D-карте (этап 34): модели KayKit (tools/extract-models/units.mjs), каждая — свой файл, грузится один раз,
// на каждый жетон — копия со своей оснасткой (SkeletonUtils.clone: геометрия и материалы общие). Анимация — только пока
// противник идёт: карта рисует кадры по необходимости, «стоит» — одна поза (первый кадр Idle), без постоянной перерисовки.

/** Рост модели в единицах карты — как у фигурки-спрайта (Anchored size 30). */
const HEIGHT = 28;

type Proto = { scene: THREE.Group; clips: THREE.AnimationClip[]; height: number };
const protos = new Map<UnitId, Promise<Proto | null>>();

function proto(id: UnitId): Promise<Proto | null> {
  let p = protos.get(id);
  if (!p) {
    p = new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(`/models/units/${id}.glb?v=${catalog.v}`)
      .then((gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        return { scene: gltf.scene, clips: gltf.animations, height: Math.max(0.1, box.max.y - box.min.y) };
      })
      .catch(() => null);
    protos.set(id, p);
  }
  return p;
}

export class Unit {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction | null;
  private walk: THREE.AnimationAction | null;
  private walking = false;
  private own: THREE.Material[] = [];

  constructor(p: Proto, shadows: boolean) {
    const body = clone(p.scene);
    body.scale.setScalar(HEIGHT / p.height);
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = shadows;
      // у скина рамка — по позе привязки: при ходьбе части выходят за неё, отсечение их не прячет
      m.frustumCulled = false;
    });
    this.root.add(body);
    this.mixer = new THREE.AnimationMixer(body);
    const clip = (name: string) => p.clips.find((c) => c.name === name);
    const idle = clip(catalog.anims.idle);
    const walk = clip(catalog.anims.walk);
    this.idle = idle ? this.mixer.clipAction(idle) : null;
    this.walk = walk ? this.mixer.clipAction(walk) : null;
    this.idle?.play();
    this.mixer.update(0);
  }

  /** Идёт или стоит. Стоит — поза первого кадра «Idle». */
  setWalking(on: boolean) {
    if (on === this.walking) return;
    this.walking = on;
    this.mixer.stopAllAction();
    (on ? this.walk : this.idle)?.reset().play();
    this.mixer.update(0);
  }

  /** Кадр анимации; true — поза изменилась (нужна перерисовка и тени). */
  update(dt: number): boolean {
    if (!this.walking) return false;
    this.mixer.update(dt);
    return true;
  }

  /** Полупрозрачность (скрытый от игроков противник у мастера): материалы копируются только тогда. */
  setOpacity(a: number) {
    if (a >= 1 && !this.own.length) return;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      const next = list.map((mat) => {
        if (this.own.includes(mat)) return mat;
        const c = mat.clone();
        this.own.push(c);
        return c;
      });
      next.forEach((mat) => {
        mat.transparent = a < 1;
        mat.opacity = a;
        mat.depthWrite = a >= 1;
      });
      m.material = Array.isArray(m.material) ? next : next[0]!;
    });
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
    this.own.forEach((m) => m.dispose());
  }
}

/** Модель для жетона; null — не загрузилась (жетон остаётся фигуркой). */
export async function loadUnit(id: UnitId, shadows: boolean): Promise<Unit | null> {
  const p = await proto(id);
  return p ? new Unit(p, shadows) : null;
}
