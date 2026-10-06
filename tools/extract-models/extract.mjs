// Модели 3D-карты из KayKit Medieval Hexagon Pack 1.0 (Kay Lousberg, CC0) — закреплённый коммит.
// Берёт только отобранные модели (MODELS ниже), ничего не перерисовывает.
// Здания в наборе — в четырёх цветах, которые отличаются только сдвигом U у «цветных» вершин (синий 0, красный 1/8,
// жёлтый 2/4·1/8… см. TEAM_SHIFT). Поэтому берётся только синий вариант, а цветные вершины помечаются атрибутом _TEAM (0/1):
// на клиенте шейдер сдвигает U по цвету фракции экземпляра.
// На выходе:
//   web/public/models/world.glb   — все модели одним файлом: у каждой свой узел с именем id, общая текстура, квантование;
//   web/src/maps3d/models.json     — каталог: id → размеры (габарит, низ), есть ли цветные вершины.
// Запуск: node tools/extract-models/extract.mjs  (KAYKIT_DIR=<клон> — чтобы не клонировать заново).
// Результат руками не править — менять MODELS и запускать снова.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, mergeDocuments, prune, quantize, unpartition, weld } from '@gltf-transform/functions';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = 'https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0.git';
const SHA = '84fa4e91af6a88989be7c99e0891cede11f2ca38';

/** Сдвиг U цветных вершин относительно синего варианта. */
export const TEAM_SHIFT = { blue: 0, red: 0.125, yellow: 0.25, green: 0.375 };

// [id, путь в Assets/gltf без расширения; {c} — цвет для зданий фракции]
const MODELS = [
  // здания фракции
  ['castle', 'buildings/{c}/building_castle_{c}'],
  ['home_a', 'buildings/{c}/building_home_A_{c}'],
  ['home_b', 'buildings/{c}/building_home_B_{c}'],
  ['church', 'buildings/{c}/building_church_{c}'],
  ['tavern', 'buildings/{c}/building_tavern_{c}'],
  ['market', 'buildings/{c}/building_market_{c}'],
  ['blacksmith', 'buildings/{c}/building_blacksmith_{c}'],
  ['windmill', 'buildings/{c}/building_windmill_{c}'],
  ['watermill', 'buildings/{c}/building_watermill_{c}'],
  ['well', 'buildings/{c}/building_well_{c}'],
  ['tower_a', 'buildings/{c}/building_tower_A_{c}'],
  ['tower_b', 'buildings/{c}/building_tower_B_{c}'],
  ['barracks', 'buildings/{c}/building_barracks_{c}'],
  ['mine', 'buildings/{c}/building_mine_{c}'],
  ['lumbermill', 'buildings/{c}/building_lumbermill_{c}'],
  ['flag', 'decoration/props/flag_{c}'],
  // нейтральные постройки
  ['wall', 'buildings/neutral/wall_straight'],
  ['wall_gate', 'buildings/neutral/wall_straight_gate'],
  ['ruin', 'buildings/neutral/building_destroyed'],
  ['grain', 'buildings/neutral/building_grain'],
  ['scaffold', 'buildings/neutral/building_scaffolding'],
  ['fence', 'buildings/neutral/fence_wood_straight'],
  ['stage', 'buildings/neutral/building_stage_A'],
  // природа
  ['mountain_a', 'decoration/nature/mountain_A'],
  ['mountain_b', 'decoration/nature/mountain_B'],
  ['mountain_c', 'decoration/nature/mountain_C'],
  ['mountain_a_grass', 'decoration/nature/mountain_A_grass'],
  ['mountain_b_grass', 'decoration/nature/mountain_B_grass_trees'],
  ['mountain_c_grass', 'decoration/nature/mountain_C_grass'],
  ['hills_a', 'decoration/nature/hills_A'],
  ['hills_b', 'decoration/nature/hills_B_trees'],
  ['hills_c', 'decoration/nature/hills_C'],
  ['hill_a', 'decoration/nature/hill_single_A'],
  ['hill_b', 'decoration/nature/hill_single_B'],
  ['tree_a', 'decoration/nature/tree_single_A'],
  ['tree_b', 'decoration/nature/tree_single_B'],
  ['trees_a_s', 'decoration/nature/trees_A_small'],
  ['trees_a_m', 'decoration/nature/trees_A_medium'],
  ['trees_a_l', 'decoration/nature/trees_A_large'],
  ['trees_b_s', 'decoration/nature/trees_B_small'],
  ['trees_b_m', 'decoration/nature/trees_B_medium'],
  ['trees_b_l', 'decoration/nature/trees_B_large'],
  ['trees_cut', 'decoration/nature/trees_A_cut'],
  ['rock_a', 'decoration/nature/rock_single_A'],
  ['rock_b', 'decoration/nature/rock_single_B'],
  ['rock_c', 'decoration/nature/rock_single_C'],
  ['rock_d', 'decoration/nature/rock_single_D'],
  ['cloud_big', 'decoration/nature/cloud_big'],
  ['cloud_small', 'decoration/nature/cloud_small'],
  ['lily', 'decoration/nature/waterlily_A'],
  // мелочи
  ['tent', 'decoration/props/tent'],
  ['barrel', 'decoration/props/barrel'],
  ['crate', 'decoration/props/crate_A_big'],
  ['sack', 'decoration/props/sack'],
  ['weaponrack', 'decoration/props/weaponrack'],
  ['lumber', 'decoration/props/resource_lumber'],
  ['stone', 'decoration/props/resource_stone'],
];

function repoDir() {
  if (process.env.KAYKIT_DIR) return process.env.KAYKIT_DIR;
  const dir = join(tmpdir(), `kaykit-hex-${SHA.slice(0, 8)}`);
  if (!existsSync(join(dir, '.git'))) {
    rmSync(dir, { recursive: true, force: true });
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', REPO]);
    execFileSync('git', ['-C', dir, 'fetch', '-q', '--depth', '1', 'origin', SHA], { stdio: 'inherit' });
    execFileSync('git', ['-C', dir, 'checkout', '-q', 'FETCH_HEAD']);
  }
  return dir;
}

/** Отметка цветных вершин: 1 там, где U красного варианта отличается от синего. */
function markTeam(blue, red) {
  const bp = blue
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives());
  const rp = red
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives());
  if (bp.length !== rp.length) throw new Error('разное число примитивов у цветов');
  let marked = 0;
  bp.forEach((p, i) => {
    const a = p.getAttribute('TEXCOORD_0').getArray();
    const b = rp[i].getAttribute('TEXCOORD_0').getArray();
    if (a.length !== b.length) throw new Error('разное число вершин у цветов');
    const team = new Uint8Array(a.length / 2);
    for (let v = 0; v < team.length; v++) team[v] = Math.abs(b[v * 2] - a[v * 2]) > 0.01 ? 1 : 0;
    marked += team.reduce((s, x) => s + x, 0);
    p.setAttribute('_TEAM', blue.createAccessor().setType('SCALAR').setArray(team).setBuffer(blue.getRoot().listBuffers()[0]));
  });
  return marked > 0;
}

async function main() {
  const dir = join(repoDir(), 'addons/kaykit_medieval_hexagon_pack/Assets/gltf');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const out = new Document();
  out.createBuffer();
  const scene = out.createScene('world');
  const catalog = {};

  for (const [id, path] of MODELS) {
    const src = await io.read(join(dir, path.replaceAll('{c}', 'blue') + '.gltf'));
    const team = path.includes('{c}') ? markTeam(src, await io.read(join(dir, path.replaceAll('{c}', 'red') + '.gltf'))) : false;
    const srcScene = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0];
    const b = getBounds(srcScene);
    catalog[id] = {
      size: [0, 1, 2].map((i) => +(b.max[i] - b.min[i]).toFixed(3)),
      min: b.min.map((v) => +v.toFixed(3)),
      max: b.max.map((v) => +v.toFixed(3)),
      team,
    };
    const map = mergeDocuments(out, src);
    const merged = map.get(srcScene);
    const group = out.createNode(id);
    for (const n of merged.listChildren()) group.addChild(n);
    scene.addChild(group);
    merged.dispose();
  }

  await out.transform(unpartition(), dedup(), weld(), prune({ keepAttributes: true }), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
  const glb = await io.writeBinary(out);
  mkdirSync(join(root, 'web/public/models'), { recursive: true });
  writeFileSync(join(root, 'web/public/models/world.glb'), glb);
  const lines = Object.entries(catalog).map(([id, m]) => `  ${JSON.stringify(id)}: ${JSON.stringify(m)}`);
  const head = `"source": ${JSON.stringify(`KayKit Medieval Hexagon Pack 1.0 @ ${SHA.slice(0, 8)}`)},\n "teamShift": ${JSON.stringify(TEAM_SHIFT)}`;
  writeFileSync(join(root, 'web/src/maps3d/models.json'), `{\n ${head},\n "models": {\n${lines.join(',\n')}\n }\n}\n`);
  console.log(`world.glb: ${(glb.byteLength / 1024).toFixed(0)} КБ, моделей: ${MODELS.length}`);
}

await main();
