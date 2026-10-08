// Наборы украшений по темам (каталог источников и выбор — docs/design-packs.md).
// Части: corner — угол панели (второй угол — он же, повёрнутый); band — полоса под заголовком; mark — эмблема-водяной знак;
// pat — узор фона страницы (плитка); tex — зерно панели и страницы; font — шрифт заголовков (Google Fonts, с кириллицей).
// crop — доли [x, y, w, h] от картинки источника (выбраны по листу с сеткой); mode — откуда прозрачность (см. extract.mjs).
import { helpers } from './sources.mjs';

const { wm, oc, acg, ph, hero } = helpers;

const MEYER = 'Franz Sales Meyer, «Handbook of Ornament» (1898)';
const meyer = (n) => wm(`${n}.png`, MEYER);
const DOLM = 'Heinrich Dolmetsch, «Ornament» (1906)';
const dolm = (t) => wm(`Ornament – sborník slohových ozdob všech období umění (1906), Table ${t} (Heinrich Dolmetsch).jpg`, DOLM);
const bilibin = (n) => wm(n, 'Иван Билибин');

export const PACKS = {
  // ---- книжные и сказочные ----
  other: {
    corner: { src: 'va', file: 'frames/frame10.svg', crop: [0, 0, 0.18, 0.12], max: [256, 256] },
    band: { src: bilibin('Ivan Bilibin 161.jpg'), crop: [0.32, 0.82, 0.34, 0.16], lo: 30, hi: 140, max: [640, 96] },
    mark: { src: bilibin('Ivan Bilibin 161.jpg'), crop: [0.78, 0.63, 0.16, 0.28], lo: 30, hi: 140, max: [256, 256] },
    tex: { src: acg('Paper003'), strength: 0.7 },
    font: 'Kurale',
  },
  fantasy: {
    corner: { src: 'va', file: 'frames/frame15.svg', crop: [0, 0, 0.1, 0.16], max: [256, 256] },
    band: { src: 'va', file: 'frames/frame6.svg', crop: [0.02, 0, 0.46, 1], max: [640, 96] },
    tex: { src: acg('Paper006'), strength: 0.9 },
    font: 'Cormorant Garamond',
  },
  hp: {
    corner: { src: oc(259828, 'Victorian Style Frame', 'GDJ'), crop: [0.02, 0, 0.16, 0.16], max: [256, 256] },
    band: { src: oc(259828, 'Victorian Style Frame', 'GDJ'), crop: [0.25, 0, 0.5, 0.08], max: [640, 64] },
    tex: { src: acg('Paper001'), strength: 0.6 },
    font: 'Marck Script',
  },
  witcher: {
    band: { src: dolm(35), crop: [0.52, 0.083, 0.4, 0.06], mode: 'light', lo: 205, hi: 235, max: [640, 80] },
    tex: { src: acg('Leather014'), strength: 1 },
    font: 'Ruslan Display',
  },
  dishonored: {
    band: { src: meyer('Orna112-Schmiedeblumen'), crop: [0.05, 0.79, 0.89, 0.14], max: [640, 110] },
    tex: { src: ph('rust_coarse_01'), strength: 0.9 },
    font: 'Old Standard TT',
  },
  hist: {
    corner: { src: dolm(35), crop: [0.04, 0.33, 0.2, 0.22], mode: 'light', lo: 200, hi: 235, max: [256, 256] },
    band: { src: dolm(35), crop: [0.06, 0.08, 0.44, 0.06], mode: 'light', lo: 200, hi: 235, max: [640, 80] },
    tex: { src: acg('Paper006'), strength: 1 },
    font: 'Ponomar',
  },
  tc: {
    mark: { src: meyer('Orna019-Masswerk'), crop: [0.64, 0.02, 0.27, 0.16], max: [256, 256] },
    tex: { src: acg('PavingStones046'), strength: 0.8 },
    font: 'Cormorant SC',
  },
  gow: {
    corner: { src: meyer('Orna090-Flechtband'), crop: [0.075, 0.045, 0.18, 0.12], max: [256, 256] },
    band: { src: meyer('Orna090-Flechtband'), crop: [0.075, 0.36, 0.85, 0.12], max: [640, 64] },
    tex: { src: acg('Rock030'), strength: 0.9 },
    font: 'Ruslan Display',
  },
  tes: {
    band: { src: meyer('Orna090-Flechtband'), crop: [0.165, 0.225, 0.67, 0.075], max: [640, 64] },
    mark: { src: wm('Vegvisir.svg', 'Общественное достояние (исландский символ)'), max: [256, 256] },
    tex: { src: acg('Paper006'), strength: 1.2 },
    font: 'Cormorant Unicase',
  },
  souls: {
    corner: { src: meyer('Orna116-Krabben-Wasserspeier'), crop: [0.7, 0.02, 0.24, 0.17], max: [256, 256] },
    mark: { src: meyer('Orna019-Masswerk'), crop: [0.37, 0.63, 0.27, 0.33], max: [256, 320] },
    tex: { src: ph('burned_ground_01'), strength: 1 },
    font: 'Cormorant SC',
  },
  myth: {
    band: { src: meyer('Orna081-Maeander'), crop: [0.505, 0.07, 0.415, 0.075], max: [640, 64] },
    tex: { src: acg('Marble012'), strength: 0.8 },
    font: 'Forum',
  },
  percy: {
    band: { src: meyer('Orna097-Wasserwogenband'), crop: [0.09, 0.522, 0.395, 0.075], max: [640, 64] },
    pat: { src: wm('Seigaiha.svg', 'Общественное достояние'), max: [96, 96], fit: 'fill', css: { size: 48 } },
    tex: { src: acg('Marble023'), strength: 0.7 },
    font: 'Philosopher',
  },
};

void hero;
