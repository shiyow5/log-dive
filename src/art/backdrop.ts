import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";

/**
 * 背景（Issue #101）。単色の暗背景に部屋が浮いて見えるのを、遠景タイル＋ビネットで奥行きに変える。
 * すべてコードで描くドット絵（外部画像なし）。整数ドットのまま pixelArt（最近傍）で拡大するのでぼやけない。
 *
 * 層（奥→手前）:
 *  1. 遠景 = 石壁のレンガ（32×16 ドットのタイル）。背景色 #0f1a1c にごく近い明るさ。
 *  2. 手前 = 床の石畳（16×16）。壁より暗く、画面下 FLOOR_RATIO の帯だけ。
 *  3. ビネット = 周辺ほど暗くする（段階を数ドット単位で落とす）。
 *
 * 文字の可読性: タイルの最大明度は WALL_LIGHT（#16262a）以下。本文 #e4f1ec は 10:1 以上、
 * 弱い文字 #a9c2bc も 4.5:1 以上を保つ（DESIGN.md「Backdrop」の表）。
 */
export const BACKDROP = {
  /** 壁タイルの色（面・目地・ハイライト）。最大明度は面+ハイライト。 */
  wallFace: 0x122024,
  wallMortar: 0x0c1517,
  wallLight: 0x16262a,
  /** 床タイルの色。壁より暗い。 */
  floorFace: 0x0d171a,
  floorSeam: 0x091113,
  floorLight: 0x111d20,
  /** ビネットの色（#0F1A1C より暗い）。 */
  vignette: 0x060b0c,
  /** 画面下の何割を床にするか */
  floorRatio: 0.3,
  /** ビネット最外周の不透明度 */
  vignetteMax: 0.78,
} as const;

const TILE_WALL = "ld-backdrop-wall";
const TILE_FLOOR = "ld-backdrop-floor";
const VIGNETTE = "ld-backdrop-vignette";
const VIG_W = 80;
const VIG_H = 45;

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, "0")}`;
}

function makeCanvas(
  textures: Phaser.Textures.TextureManager,
  key: string,
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): void {
  if (textures.exists(key)) return;
  const tex = textures.createCanvas(key, w, h);
  if (!tex) return;
  paint(tex.getContext());
  tex.refresh();
}

/** 石壁。32×16 に 2 段のレンガ（段ごとに半個ずらす）。 */
function paintWall(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = hex(BACKDROP.wallFace);
  ctx.fillRect(0, 0, 32, 16);
  ctx.fillStyle = hex(BACKDROP.wallMortar);
  // 横目地（各段の下端）
  ctx.fillRect(0, 7, 32, 1);
  ctx.fillRect(0, 15, 32, 1);
  // 縦目地（上段は x=0,16／下段は x=8,24）
  for (const x of [0, 16]) ctx.fillRect(x, 0, 1, 7);
  for (const x of [8, 24]) ctx.fillRect(x, 8, 1, 7);
  // 各レンガの左上にハイライト 1 ドット線
  ctx.fillStyle = hex(BACKDROP.wallLight);
  for (const x of [1, 17]) ctx.fillRect(x, 0, 6, 1);
  for (const x of [9, 25]) ctx.fillRect(x, 8, 6, 1);
  // 汚れ（固定位置のドット。乱数を使わず毎回同じ）
  ctx.fillStyle = hex(BACKDROP.wallMortar);
  for (const [x, y] of [
    [5, 3],
    [11, 5],
    [21, 2],
    [28, 5],
    [4, 11],
    [14, 13],
    [19, 10],
    [30, 12],
  ] as const)
    ctx.fillRect(x, y, 1, 1);
}

/** 石畳。16×16 に 1 枚（右と下に目地）。 */
function paintFloor(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = hex(BACKDROP.floorFace);
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = hex(BACKDROP.floorSeam);
  ctx.fillRect(15, 0, 1, 16);
  ctx.fillRect(0, 15, 16, 1);
  ctx.fillStyle = hex(BACKDROP.floorLight);
  ctx.fillRect(1, 1, 13, 1);
  ctx.fillRect(1, 1, 1, 13);
  ctx.fillStyle = hex(BACKDROP.floorSeam);
  for (const [x, y] of [
    [6, 6],
    [10, 9],
    [4, 11],
  ] as const)
    ctx.fillRect(x, y, 1, 1);
}

/**
 * ビネット。80×45 の小さな画像を画面いっぱいに拡大する（1 マス = 4×4 ドット）。
 * 中心は透明、周辺ほど濃く。濃さは 6 段階にまとめて、ドット絵らしい階段状にする。
 */
function paintVignette(ctx: CanvasRenderingContext2D): void {
  const steps = 6;
  for (let y = 0; y < VIG_H; y++) {
    for (let x = 0; x < VIG_W; x++) {
      const dx = (x + 0.5) / VIG_W - 0.5;
      const dy = (y + 0.5) / VIG_H - 0.5;
      // 楕円距離（中心 0、四隅 約 1.41）
      const d = Math.hypot(dx * 2, dy * 2);
      const t = Math.min(1, Math.max(0, (d - 0.55) / (1.3 - 0.55)));
      const q = Math.round(t * t * steps) / steps;
      if (q <= 0) continue;
      ctx.fillStyle = `rgba(${(BACKDROP.vignette >> 16) & 255},${(BACKDROP.vignette >> 8) & 255},${
        BACKDROP.vignette & 255
      },${(q * BACKDROP.vignetteMax).toFixed(3)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

export interface Backdrop {
  /** canvas の内部高さ（ドット）が変わったとき（縦持ちマップ）に呼ぶ。 */
  resize(height: number): void;
}

/** 背景を足す。マップ・戦闘の create() の先頭（他の描画より前）で呼ぶ。 */
export function addBackdrop(scene: Phaser.Scene, height: number = GAME_HEIGHT): Backdrop {
  makeCanvas(scene.textures, TILE_WALL, 32, 16, paintWall);
  makeCanvas(scene.textures, TILE_FLOOR, 16, 16, paintFloor);
  makeCanvas(scene.textures, VIGNETTE, VIG_W, VIG_H, paintVignette);

  const W = GAME_WIDTH;
  const wall = scene.add.tileSprite(0, 0, W, height, TILE_WALL).setOrigin(0, 0).setDepth(-100);
  const floor = scene.add.tileSprite(0, 0, W, 0, TILE_FLOOR).setOrigin(0, 0).setDepth(-99);
  const vig = scene.add.image(0, 0, VIGNETTE).setOrigin(0, 0).setDepth(-98);

  const layout = (h: number): void => {
    wall.setSize(W, h);
    // 床は 16 ドットの整数倍の高さに揃える（タイルが途中で切れない）
    const fh = Math.max(16, Math.round((h * BACKDROP.floorRatio) / 16) * 16);
    floor.setSize(W, fh).setPosition(0, h - fh);
    vig.setDisplaySize(W, h);
  };
  layout(height);
  return { resize: layout };
}
