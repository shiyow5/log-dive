import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";

/**
 * 背景（Issue #101）。単色の暗背景に部屋が浮いて見えるのを、遠景タイル＋ビネットで奥行きに変える。
 * すべてコードで描くドット絵（外部画像なし）。整数ドットのまま pixelArt（最近傍）で拡大するのでぼやけない。
 *
 * 層（奥→手前。表示は合成済みの1枚）:
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

/** 合成済みの背景テクスチャのキー（シーンごとに1枚）。 */
const TEXTURE_PREFIX = "ld-backdrop-";
const VIG_W = 80;
const VIG_H = 45;

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, "0")}`;
}

/** タイル・ビネットの元絵（DOM の canvas）。Phaser のテクスチャにはしない（合成の材料にだけ使う）。 */
function makeCanvas(
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (ctx) paint(ctx);
  return c;
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

/** 背景オブジェクトに付ける data キー。マップの描き直し（clearMapObjects）で消さない目印。 */
export const BACKDROP_DATA_KEY = "ld-backdrop";

/** 背景（addBackdrop が足した壁・床・ビネット）かどうか。 */
export function isBackdropObject(o: Phaser.GameObjects.GameObject): boolean {
  return o.getData(BACKDROP_DATA_KEY) === true;
}

export interface Backdrop {
  /** canvas の内部高さ（ドット）が変わったとき（縦持ちマップ）に呼ぶ。 */
  resize(height: number): void;
}

/** 壁・床・ビネットを W×h（ドット）の1枚に描く。 */
function paintComposite(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  const wall = ctx.createPattern(makeCanvas(32, 16, paintWall), "repeat");
  if (wall) {
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);
  }
  // 床は 16 ドットの整数倍の高さに揃える（タイルが途中で切れない）。タイルは床の上端から敷く。
  const fh = Math.max(16, Math.round((h * BACKDROP.floorRatio) / 16) * 16);
  const floor = ctx.createPattern(makeCanvas(16, 16, paintFloor), "repeat");
  if (floor) {
    ctx.save();
    ctx.translate(0, h - fh);
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, w, fh);
    ctx.restore();
  }
  ctx.drawImage(makeCanvas(VIG_W, VIG_H, paintVignette), 0, 0, w, h);
}

/**
 * 背景を足す。マップ・戦闘の create() の先頭（他の描画より前）で呼ぶ。
 * 3層を毎フレーム重ねて描くと全画面の塗りが3回になり重い（CI のソフトウェア描画で e2e が時間切れになった）。
 * そこで3層をドット解像度の canvas 1枚に合成し、Image 1つで出す。見た目は同じ（カメラの最近傍拡大）。
 */
export function addBackdrop(scene: Phaser.Scene, height: number = GAME_HEIGHT): Backdrop {
  const W = GAME_WIDTH;
  const key = `${TEXTURE_PREFIX}${scene.scene.key}`;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, W, height);
  const img = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(-100);
  img.setData(BACKDROP_DATA_KEY, true);

  let drawnH = -1;
  const layout = (h: number): void => {
    // シーン終了時（resetView）にも呼ばれる。破棄済みなら何もしない。
    if (!tex || !img.scene || h === drawnH) return;
    drawnH = h;
    tex.setSize(W, h);
    paintComposite(tex.getContext(), W, h);
    tex.refresh();
    img.setTexture(key).setOrigin(0, 0);
  };
  layout(height);
  return { resize: layout };
}
