import { hex, mix, rand } from "pixelfx";
import type { Painter } from "pixelfx";
import { TITLE_BG_DEFAULTS } from "../ui/tokens";

/**
 * タイトル背景（Issue #110）。桜と賑やかな蛍をやめ、「ログに潜る」に合う暗いログ画面にする。
 * - 流れるログ文字（等幅・薄緑・低コントラスト）を画面の左右の縦列だけに置く
 * - 蛍は数を減らし、ロゴ禁止帯(LOGO_BAND)に入らない範囲だけで飛ばす
 * 演出専用。ルール(src/core)からは参照しない。座標は論理解像度 320×180。
 */

/** ロゴ禁止帯（論理座標）。ここには蛍・ログ文字を一切出さない。ロゴは y=42 中心。 */
export const LOGO_BAND = { x0: 80, x1: 240, y0: 28, y1: 56 } as const;
const W = 320;
const H = 180;
const LOOP = 24; // 秒。ログ文字は 1 ループで整数周期ぶん流れる
const PITCH = 6; // ログ文字の行間 px
const ROWS = H / PITCH; // 30 行ぶんで 1 周
const SIDE = 72; // 左右の文字列の幅 px（x 0〜72 / 248〜320）
const COL_W = 18;
const COLS_PER_SIDE = 4;
const FLY_COUNT = 10;

/** 色トークン。CSS 変数（src/ui/hud.css の --ld-*）から読み、無ければ同じ値の既定を使う。 */
export interface TitleBgColors {
  bgTop: string;
  bgBottom: string;
  logStamp: string;
  logBody: string;
  logEmph: string;
  fly: [string, string, string];
}
export const TITLE_BG_FALLBACK: TitleBgColors = {
  ...TITLE_BG_DEFAULTS,
  fly: [...TITLE_BG_DEFAULTS.fly],
};

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function readTitleBgColors(): TitleBgColors {
  const f = TITLE_BG_FALLBACK;
  return {
    bgTop: cssVar("--ld-title-bg-top", f.bgTop),
    bgBottom: cssVar("--ld-title-bg-bottom", f.bgBottom),
    logStamp: cssVar("--ld-title-log-stamp", f.logStamp),
    logBody: cssVar("--ld-title-log-body", f.logBody),
    logEmph: cssVar("--ld-accent", f.logEmph),
    fly: [
      cssVar("--ld-title-fly-1", f.fly[0]),
      cssVar("--ld-title-fly-2", f.fly[1]),
      cssVar("--ld-title-fly-3", f.fly[2]),
    ],
  };
}

const TOKENS = [
  "INFO",
  "WARN",
  "ERR",
  "GET",
  "200",
  "404",
  "OK",
  "0x1f",
  "ret",
  "null",
  "RUN",
  "TRCE",
];

/** 列 col の row 行目に出す文字（決定的）。col 0 はタイムスタンプ列。 */
export function logToken(col: number, row: number): string {
  if (col === 0) {
    const m = Math.floor(rand(7, row, 1) * 60);
    const s = Math.floor(rand(7, row, 2) * 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return TOKENS[Math.floor(rand(11, col, row) * TOKENS.length)] as string;
}

export interface Fly {
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  n1: number;
  n2: number;
  ph1: number;
  ph2: number;
  rhythm: number;
  phase: number;
}

/** 蛍の軌道パラメータ。y は必ず LOGO_BAND より下に収まる（cy-ay-余白 > y1+glow）。 */
export function makeFlies(seed: number): Fly[] {
  return Array.from({ length: FLY_COUNT }, (_, i) => {
    const R = (n: number) => rand(seed, i, n);
    return {
      cx: 24 + R(1) * (W - 48),
      cy: 84 + R(2) * 78,
      ax: 8 + R(3) * 18,
      ay: 4 + R(4) * 6,
      n1: 1 + Math.floor(R(5) * 2),
      n2: 1 + Math.floor(R(6) * 2),
      ph1: R(7) * Math.PI * 2,
      ph2: R(8) * Math.PI * 2,
      rhythm: 3 + Math.floor(R(9) * 3),
      phase: R(10),
    };
  });
}

export function flyPos(f: Fly, t: number): [number, number] {
  const k = (Math.PI * 2 * t) / LOOP;
  return [f.cx + f.ax * Math.sin(k * f.n1 + f.ph1), f.cy + f.ay * Math.sin(k * f.n2 + f.ph2)];
}

/** 0..1。立ち上がり→保持→ゆっくり消える。 */
function glowAt(f: Fly, t: number): number {
  const per = LOOP / f.rhythm;
  const u = (((t / per + f.phase) % 1) + 1) % 1;
  return u < 0.06 ? u / 0.06 : u < 0.14 ? 1 : u < 0.4 ? 1 - (u - 0.14) / 0.26 : 0;
}

export const meta = {
  name: "TitleBg",
  desc: "Log Dive title background: dim scrolling log text in the side columns and a few fireflies, clear of the logo band.",
  tags: ["ambient", "loop", "log"],
  size: [W, H],
  origin: [0, 0],
  duration: LOOP,
  loop: true,
  fps: 30,
  options: { seed: 3 },
};

export function create(opts: { seed?: number }) {
  const c = readTitleBgColors();
  const top = hex(c.bgTop);
  const bottom = hex(c.bgBottom);
  const stamp = hex(c.logStamp);
  const body = hex(c.logBody);
  const emph = hex(c.logEmph);
  const fly = c.fly.map((v) => hex(v));
  const flies = makeFlies(opts.seed ?? 3);

  return {
    // pixelfx は draw（手前）も呼ぶので、何も描かない関数を置く
    draw(): void {},
    drawBack(p: Painter, t: number): void {
      // 背景グラデ（暗いログ画面）
      for (let y = 0; y < H; y++) p.rect(0, y, W, 1, mix(top, bottom, y / (H - 1)));

      // 流れるログ文字。左 4 列 + 右 4 列。列ごとに速さを変え、1 ループで整数行ぶん流れる。
      for (let side = 0; side < 2; side++) {
        for (let k = 0; k < COLS_PER_SIDE; k++) {
          const col = side * COLS_PER_SIDE + k;
          const x = side === 0 ? 2 + k * COL_W : W - SIDE + 2 + k * COL_W;
          // 外側(端)の列を timestamp、他を本文にする
          const isStamp = side === 0 ? k === 0 : k === COLS_PER_SIDE - 1;
          // 1 ループで画面高 H の整数倍だけ上へ流れる（継ぎ目なく繰り返す）。列ごとに速さを変える
          const offset = (t / LOOP) * H * (1 + (col % 3));
          const c0 = isStamp ? stamp : body;
          const a0 = isStamp ? 0.4 : 0.35;
          for (let r = 0; r < ROWS; r++) {
            const y = Math.round((((r * PITCH - offset) % H) + H) % H);
            if (y > H - 5) continue;
            const emphasised = !isStamp && k === 1 && r % 11 === 0;
            p.text(logToken(isStamp ? 0 : col + 1, r), x, y, emphasised ? emph : c0, {
              font: "mini",
              a: emphasised ? 0.5 : a0,
            });
          }
        }
      }

      // 蛍（少数・ロゴ禁止帯の外だけ）
      for (const f of flies) {
        const [x, y] = flyPos(f, t);
        const g = glowAt(f, t);
        const X = Math.round(x);
        const Y = Math.round(y);
        p.dot(X, Y, g > 0.5 ? (fly[2] as number) : (fly[0] as number), 0.35 + 0.65 * g);
        if (g > 0.08) {
          p.glow(x, y, 8, fly[0] as number, 0.45 * g);
          if (g > 0.4) p.glow(x, y, 3, fly[1] as number, 0.5 * g);
        }
      }
    },
  };
}
