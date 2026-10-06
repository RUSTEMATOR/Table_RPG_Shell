import * as THREE from 'three';
import { MAP_H, MAP_W } from '@zg/shared';
import type { FogMask } from './terrain.ts';

// Туман 3D-карты — в шейдерах: маска открытых регионов (две — старая и новая, между ними плавный переход), по ней
// земля под туманом опускается в ровное облачное поле и бледнеет, а модели растворяются (discard с шумом по краю).
// Облака тумана — наоборот: исчезают там, где туман разошёлся. Мастеру туман выключен (uFogOn = 0).

export type FogUniforms = {
  uFogA: { value: THREE.DataTexture };
  uFogB: { value: THREE.DataTexture };
  uFogT: { value: number };
  uFogOn: { value: number };
  uFogColor: { value: THREE.Color };
  uTime: { value: number };
};

export function maskTexture(m: FogMask): THREE.DataTexture {
  const t = new THREE.DataTexture(m.data, m.w, m.h, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export function fogUniforms(empty: FogMask): FogUniforms {
  const t = maskTexture(empty);
  return {
    uFogA: { value: t },
    uFogB: { value: t },
    uFogT: { value: 1 },
    uFogOn: { value: 1 },
    uFogColor: { value: new THREE.Color('#e4ded0') },
    uTime: { value: 0 },
  };
}

const COMMON = /* glsl */ `
uniform sampler2D uFogA;
uniform sampler2D uFogB;
uniform float uFogT;
uniform float uFogOn;
uniform vec3 uFogColor;
uniform float uTime;
float zgHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float zgNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(zgHash(i), zgHash(i + vec2(1.0, 0.0)), u.x), mix(zgHash(i + vec2(0.0, 1.0)), zgHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float zgFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * zgNoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
float zgFogAt(vec2 xz) {
  vec2 uv = xz / vec2(${MAP_W}.0, ${MAP_H}.0);
  return uFogOn * mix(texture(uFogA, uv).r, texture(uFogB, uv).r, uFogT);
}
`;

type Kind = 'terrain' | 'skirt' | 'model' | 'cloud';

/**
 * Подключает туман к стандартному материалу. terrain — земля опускается и бледнеет; model — растворяется в тумане
 * (и сдвигает U цветных вершин по цвету фракции экземпляра); cloud — облако тумана, растворяется там, где открыто.
 * Годится и для материала тени (MeshDepthMaterial): иначе спрятанный в тумане замок отбрасывал бы тень.
 */
export function patchMaterial(mat: THREE.Material, u: FogUniforms, kind: Kind): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
${COMMON}
varying vec3 vZgWorld;
${kind === 'model' ? 'attribute float zgTeam;\nattribute float zgInstTeam;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        kind === 'terrain' || kind === 'skirt'
          ? `#include <begin_vertex>
float zgF = smoothstep(0.15, 0.9, zgFogAt(position.xz));
${kind === 'skirt' ? 'if (position.y > -20.0)' : ''} transformed.y = mix(transformed.y, 2.5 + 2.0 * zgFbm(position.xz * 0.012), zgF);`
          : '#include <begin_vertex>',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 zgW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
zgW = instanceMatrix * zgW;
#endif
vZgWorld = (modelMatrix * zgW).xyz;`,
      );
    if (kind === 'model')
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
vMapUv.x += zgTeam * zgInstTeam;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${COMMON}
varying vec3 vZgWorld;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        kind === 'model'
          ? `#include <clipping_planes_fragment>
float zgFd = zgFogAt(vZgWorld.xz);
if (zgFd > 0.42 + 0.3 * zgNoise(vZgWorld.xz * 0.12 + vZgWorld.y * 0.05)) discard;`
          : kind === 'cloud'
            ? `#include <clipping_planes_fragment>
float zgFd = zgFogAt(vZgWorld.xz);
if (zgFd < 0.55 - 0.3 * zgNoise(vZgWorld.xz * 0.05)) discard;`
            : '#include <clipping_planes_fragment>',
      )
      .replace(
        '#include <tonemapping_fragment>',
        kind === 'terrain' || kind === 'skirt'
          ? `float zgFt = smoothstep(0.12, 0.8, zgFogAt(vZgWorld.xz));
float zgN = zgFbm(vZgWorld.xz * 0.008 + vec2(uTime * 0.004, 0.0));
gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor * (0.84 + 0.3 * zgN), zgFt);
#include <tonemapping_fragment>`
          : '#include <tonemapping_fragment>',
      );
  };
  // разные варианты шейдера у разных видов
  mat.customProgramCacheKey = () => `zg-${kind}-${mat.type}`;
}
