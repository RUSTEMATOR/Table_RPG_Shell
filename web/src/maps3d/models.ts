import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_H, MAP_W } from '@zg/shared';
import catalog from './models.json';
import { patchMaterial, type FogUniforms } from './fog.ts';

// Модели KayKit (tools/extract-models): один world.glb, у каждой модели свой узел. Здесь каждая модель сводится в одну
// геометрию (позиции, нормали, UV, отметка цветных вершин zgTeam), а сцена рисует их экземплярами (InstancedMesh):
// одна модель — один вызов отрисовки, сколько бы домов ни было.

export type ModelId = keyof typeof catalog.models;
export const MODEL_INFO = catalog.models as Record<ModelId, { size: number[]; min: number[]; max: number[]; team: boolean }>;
export type Team = keyof typeof catalog.teamShift;
export const TEAM_SHIFT = catalog.teamShift as Record<Team, number>;

const URL = `/models/world.glb?v=${catalog.source.split('@ ')[1] ?? '1'}`;

export type Library = { geometry: Map<ModelId, THREE.BufferGeometry>; atlas: THREE.Texture };

let pending: Promise<Library> | null = null;

/** Загрузка моделей — один раз на приложение. */
export function loadLibrary(): Promise<Library> {
  // файл сжат meshopt (tools/extract-models): распаковка — MeshoptDecoder из three
  pending ??= new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(URL)
    .then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const geometry = new Map<ModelId, THREE.BufferGeometry>();
      let atlas: THREE.Texture | null = null;
      for (const group of gltf.scene.children) {
        const id = group.name as ModelId;
        if (!(id in MODEL_INFO)) continue;
        const parts: THREE.BufferGeometry[] = [];
        group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (!atlas && mat.map) atlas = mat.map;
          parts.push(plain(mesh.geometry, mesh.matrixWorld));
        });
        if (parts.length) geometry.set(id, parts.length === 1 ? parts[0]! : mergeGeometries(parts)!);
      }
      if (!atlas) throw new Error('world.glb: нет текстуры');
      const tex = atlas as THREE.Texture;
      // атлас — плашки цвета: без мип-уровней, иначе вдали соседние плашки смешиваются
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      return { geometry, atlas: tex };
    });
  return pending;
}

/** Геометрия в обычных float-атрибутах, с применённым положением узла. */
function plain(src: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const copy = (name: string, size: number) => {
    const a = src.getAttribute(name);
    if (!a) return null;
    const out = new Float32Array(a.count * size);
    for (let i = 0; i < a.count; i++) {
      out[i * size] = a.getX(i);
      if (size > 1) out[i * size + 1] = a.getY(i);
      if (size > 2) out[i * size + 2] = a.getZ(i);
    }
    return new THREE.BufferAttribute(out, size);
  };
  const pos = copy('position', 3)!;
  g.setAttribute('position', pos);
  const nor = copy('normal', 3);
  if (nor) g.setAttribute('normal', nor);
  const uv = copy('uv', 2);
  if (uv) g.setAttribute('uv', uv);
  g.setAttribute('zgTeam', copy('_team', 1) ?? new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  if (src.index) g.setIndex(Array.from(src.index.array));
  g.applyMatrix4(matrix);
  if (!nor) g.computeVertexNormals();
  return g;
}

/** Экземпляр модели на карте. x, y — точка карты, base — высота подошвы, rot — поворот вокруг вертикали. */
export type Instance = { model: ModelId; x: number; y: number; base: number; rot: number; scale: number; team?: Team; color?: string };

export type Materials = { model: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial; cloud: THREE.MeshStandardMaterial; tinted: THREE.MeshStandardMaterial };

export function makeMaterials(lib: Library, u: FogUniforms): Materials {
  const model = new THREE.MeshStandardMaterial({ map: lib.atlas, roughness: 0.85, metalness: 0 });
  patchMaterial(model, u, 'model');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patchMaterial(depth, u, 'model');
  // облака тумана: белые, исчезают над открытым
  const cloud = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, flatShading: true });
  patchMaterial(cloud, u, 'cloud');
  // облака-ориентиры (буря, мгла): цвет экземпляра, как модели — растворяются в тумане
  const tinted = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, flatShading: true, transparent: true, opacity: 0.9 });
  patchMaterial(tinted, u, 'model');
  return { model, depth, cloud, tinted };
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const sc = new THREE.Vector3();

/**
 * Экземпляры, сгруппированные по моделям: по InstancedMesh на модель. material — общий материал моделей
 * (или облаков); shadows — отбрасывать тень.
 */
/** Мелочи (бочки, ящики, флаги, камни, кувшинки…): видны только вблизи — издали их всё равно не разглядеть. */
export const PROPS = new Set<ModelId>(['barrel', 'crate', 'sack', 'weaponrack', 'lumber', 'stone', 'lily', 'flag', 'rock_a', 'rock_b', 'rock_c', 'rock_d']);

/** Сетка ячеек карты для отсечения невидимого: вблизи камера не рисует ячейки за краем кадра. */
const CELLS_X = 4,
  CELLS_Y = 4;

export function instanceGroup(lib: Library, list: Instance[], material: THREE.Material, opts: { shadows: boolean; depth?: THREE.Material }): THREE.Group {
  const group = new THREE.Group();
  const by = new Map<string, Instance[]>();
  for (const i of list) {
    const cx = Math.min(CELLS_X - 1, Math.max(0, Math.floor((i.x / MAP_W) * CELLS_X)));
    const cy = Math.min(CELLS_Y - 1, Math.max(0, Math.floor((i.y / MAP_H) * CELLS_Y)));
    const key = `${i.model}|${cx}|${cy}`;
    const arr = by.get(key);
    if (arr) arr.push(i);
    else by.set(key, [i]);
  }
  for (const [key, arr] of by) {
    const id = key.split('|')[0] as ModelId;
    const geo = lib.geometry.get(id);
    if (!geo) continue;
    // своя геометрия у каждой кучки (атрибут цвета фракции экземпляров), но буферы вершин — общие с моделью
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) g.setAttribute(name, attr);
    g.setIndex(geo.index);
    const mesh = new THREE.InstancedMesh(g, material, arr.length);
    const team = new Float32Array(arr.length);
    arr.forEach((it, n) => {
      q.setFromAxisAngle(up, it.rot);
      v.set(it.x, it.base, it.y);
      sc.setScalar(it.scale);
      m4.compose(v, q, sc);
      mesh.setMatrixAt(n, m4);
      team[n] = TEAM_SHIFT[it.team ?? 'blue'];
      if (it.color) mesh.setColorAt(n, new THREE.Color(it.color));
    });
    g.setAttribute('zgInstTeam', new THREE.InstancedBufferAttribute(team, 1));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = opts.shadows && !PROPS.has(id);
    mesh.receiveShadow = opts.shadows;
    if (opts.depth) mesh.customDepthMaterial = opts.depth;
    mesh.computeBoundingSphere();
    mesh.userData.instances = arr;
    mesh.userData.prop = PROPS.has(id);
    group.add(mesh);
  }
  return group;
}

/**
 * Освободить группу. Буферы вершин у кучек одной модели общие: three.js после освобождения просто загрузит их заново
 * для тех кучек, что остались на сцене.
 */
export function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh) return;
    m.geometry.dispose();
    m.dispose();
  });
}
