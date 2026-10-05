// Типы к engine.mjs (перенос из артефакта). Только то, что использует клиент.
export interface ThemeBrief {
  label: string;
  bg: string;
  panel: string;
  ink: string;
  glyph?: string;
  [k: string]: unknown;
}
export const THEMES: Record<string, ThemeBrief>;
export const PICTO: Record<string, string>;
export const PRELOADED_FONTS: Set<string>;
export const FALLBACK_COLORS: Record<'light' | 'dark', Record<string, string>>;
export const DEMAND_WORDS: string[];
export function isTheme(k: unknown): boolean;
export function themeFor(x: { cardTheme?: string; universe?: string; source?: string }): string;
export function themeName(id: string): string;
export function settingThemeOf(t: { universe?: string; genre?: string } | null | undefined): string;
export function themeFamilies(id: string, gm: boolean): string[];
export function fontsHref(fams: string[]): string;
export function themeCss(id: string, withTiers: boolean): string;
export function themeAttrs(id: string, gm: boolean): string;
export function ornSvg(id: string): string;
export function pictoSvg(key: string, cls?: string): string;
export function catChipHtml(key: string, label: string, stid?: string): string;
export function mdLite(t: string): string;
export function esc(s: unknown): string;
export function dot(s: unknown): string;
export function magicFamily(id: string, genre?: string): { p: string; s: string; pitch: number };
export function isDarkTheme(T: ThemeBrief): boolean;
export type Prim = Record<string, unknown>;
export function patPrims(id: string, w: number, h: number): Prim[];
export function patSpec(id: string): { kind: string; mode: 'tile' | 'cover' | 'badge'; tile: [number, number] };
export function primsSvgBody(prims: Prim[], cmap: Record<string, string>): string;
export function svgDoc(body: string, w: number, h: number): string;
export function svgUrl(svg: string): string;
export function themeCmap(T: ThemeBrief): Record<string, string>;
export function mixHex(a: string, b: string, t: number): string;
export function relLum(h: string): number;
