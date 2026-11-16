/**
 * 配色トークン（#96）。定義元は src/ui/hud.css の :root（--ld-*）。
 * Phaser 側（Canvas 描画）は CSS を直接参照できないので、ここで getComputedStyle から読む。
 * document が無い環境（vitest の node 環境）や変数が未読込のときは DEFAULTS を返す。
 * DEFAULTS は hud.css の :root と同じ値にそろえる（tests/unit/tokens.test.ts が検査する）。
 */
export const TOKEN_DEFAULTS = {
  bg: "#0f1a1c",
  panel: "#1b2b2e",
  "panel-up": "#26393d",
  text: "#e4f1ec",
  "text-weak": "#a9c2bc",
  border: "#8fa9a3",
  "border-weak": "#4a6a70",
  line: "#5a7a80",
  accent: "#e8c468",
  danger: "#ff6b5e",
  info: "#7ebeab",
  stairs: "#88c0d0",
  boss: "#b48ead",
  "visited-fill": "#33494e",
  "current-fill": "#4a3f1c",
} as const;

export type TokenName = keyof typeof TOKEN_DEFAULTS;

/** トークンの色文字列（"#rrggbb"）。 */
export function token(name: TokenName): string {
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--ld-${name}`).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  }
  return TOKEN_DEFAULTS[name];
}

/** トークンの色を Phaser の 0xRRGGBB 数値で返す。 */
export function tokenNum(name: TokenName): number {
  return parseInt(token(name).slice(1), 16);
}

/** タイトル背景（#110）の既定色。定義元は src/ui/hud.css の --ld-title-*。CSS 変数が読めないときに使う。 */
export const TITLE_BG_DEFAULTS = {
  bgTop: "#070f0b",
  bgBottom: "#0c1a12",
  logStamp: "#3f6e40",
  logBody: "#2b5232",
  logEmph: "#7ebeab",
  fly: ["#9ad02a", "#d6ff5a", "#f4ffb8"],
} as const;

/** 戦闘などの演出色（CSS 変数にしない固定色）。ハードコード色チェックはこのファイルを除外する。 */
export const FX_COLORS = {
  playerHit: "#ff6b6b",
  bugHit: "#ffe66d",
  outline: "#0d0d1a",
  chestDark: "#b8903c",
  white: "#ffffff",
} as const;
