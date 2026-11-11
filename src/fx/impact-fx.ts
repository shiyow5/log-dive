import Phaser from "phaser";
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from "../config";
import { fxEnabled } from "../ui/flags";

/**
 * 被弾・ダメージ数字・宝箱の演出（Issue #104）。Phaser の tween だけで作る（新規 canvas なし）。
 * 数値は DESIGN.md の「Impact FX」と同じ。変えるときは両方そろえる。
 * 文字（HUD・ログ・敵名・HP バー）の上には重ねない。
 */
export const IMPACT = {
  shakePx: 4,
  shakeMs: 120,
  edgeFlashMs: 120,
  edgeFlashAlpha: 0.4,
  edgePx: 3,
  popRisePx: 8,
  popMs: 600,
  popFadeMs: 200,
  popMax: 3,
  chestClosedMs: 100,
  chestGlowMs: 300,
  stairsOutMs: 200,
  stairsInMs: 200,
  playerColor: "#ff6b6b",
  bugColor: "#ffe66d",
  outline: "#0d0d1a",
  stairsFade: { r: 13, g: 13, b: 26 },
} as const;

/** 数字ポップの同時表示数（シーンごと）。 */
const live = new WeakMap<Phaser.Scene, Phaser.GameObjects.Text[]>();

/** 被弾シェイク: 横だけ 4px、120ms で減衰。同時発火は上書き（加算しない）。canvas だけ揺れる（HUD は DOM なので揺れない）。 */
export function shakeX(scene: Phaser.Scene): void {
  if (!fxEnabled()) return;
  const cam = scene.cameras.main;
  cam.shakeEffect.reset();
  cam.shake(IMPACT.shakeMs, new Phaser.Math.Vector2(IMPACT.shakePx / GAME_WIDTH, 0), true);
}

/** 縁だけの赤フラッシュ（中央の文字には被せない）。 */
export function edgeFlash(scene: Phaser.Scene): void {
  if (!fxEnabled()) return;
  const g = scene.add.graphics().setDepth(20);
  const w = GAME_WIDTH;
  const h = GAME_HEIGHT;
  const t = IMPACT.edgePx;
  g.fillStyle(0xff6b6b, IMPACT.edgeFlashAlpha);
  g.fillRect(0, 0, w, t)
    .fillRect(0, h - t, w, t)
    .fillRect(0, t, t, h - 2 * t);
  g.fillRect(w - t, t, t, h - 2 * t);
  scene.tweens.add({
    targets: g,
    alpha: 0,
    duration: IMPACT.edgeFlashMs,
    onComplete: () => g.destroy(),
  });
}

/**
 * ダメージ数字。座標は整数に丸める（ぼやけ対策）。
 * 演出ありは 8px 浮いて、最後の 200ms でフェード。演出なし（?fx=0・視差効果を減らす）は位置固定で 600ms 後に消す。
 */
export function damagePop(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  color: string,
): void {
  const list = (live.get(scene) ?? []).filter((t) => t.active);
  while (list.length >= IMPACT.popMax) list.shift()?.destroy();
  const t = scene.add
    .text(Math.round(x), Math.round(y), label, {
      fontFamily: FONT_FAMILY,
      fontSize: "12px",
      color,
      stroke: IMPACT.outline,
      strokeThickness: 3,
    })
    .setOrigin(0.5)
    .setResolution(RENDER_SCALE)
    .setDepth(30);
  list.push(t);
  live.set(scene, list);
  if (!fxEnabled()) {
    scene.time.delayedCall(IMPACT.popMs, () => t.destroy());
    return;
  }
  scene.tweens.add({ targets: t, y: Math.round(y) - IMPACT.popRisePx, duration: IMPACT.popMs });
  scene.tweens.add({
    targets: t,
    alpha: 0,
    delay: IMPACT.popMs - IMPACT.popFadeMs,
    duration: IMPACT.popFadeMs,
    onComplete: () => t.destroy(),
  });
}

/** 宝箱のドット絵（閉/開、16x16）。 */
const CHEST_ROWS = {
  closed: [
    "................",
    "................",
    "..bbbbbbbbbbbb..",
    ".bYYYYYYYYYYYYb.",
    ".bYyyyyyyyyyyYb.",
    ".bYYYYYYYYYYYYb.",
    ".bbbbbbKKbbbbbb.",
    ".bYYYYYKKYYYYYb.",
    ".bYyyyyKKyyyyYb.",
    ".bYYYYYYYYYYYYb.",
    ".bYYYYYYYYYYYYb.",
    "..bbbbbbbbbbbb..",
    "................",
    "................",
    "................",
    "................",
  ],
  open: [
    "...bbbbbbbbbb...",
    "..bYYYYYYYYYYb..",
    "..bYyyyyyyyyYb..",
    "..bbbbbbbbbbbb..",
    ".bGGGGGGGGGGGGb.",
    ".bGGGGGGGGGGGGb.",
    ".bbbbbbKKbbbbbb.",
    ".bYYYYYKKYYYYYb.",
    ".bYyyyyKKyyyyYb.",
    ".bYYYYYYYYYYYYb.",
    ".bYYYYYYYYYYYYb.",
    "..bbbbbbbbbbbb..",
    "................",
    "................",
    "................",
    "................",
  ],
} as const;
const CHEST_PALETTE: Record<string, string> = {
  b: "#0d0d1a",
  Y: "#e8c468",
  y: "#b8903c",
  K: "#ffffff",
  G: "#ffe66d",
};

function chestTexture(scene: Phaser.Scene, frame: "closed" | "open"): string {
  const key = `ld-chest-${frame}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, 16, 16);
  if (!tex) return key;
  const ctx = tex.getContext();
  CHEST_ROWS[frame].forEach((row, y) => {
    [...row].forEach((c, x) => {
      const col = CHEST_PALETTE[c];
      if (!col) return;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  tex.refresh();
  return key;
}

/**
 * 宝箱を開ける: 閉 100ms → 開＋光 300ms → 開いたまま静止（取得名が読める間は残し、1.2 秒で消す）。
 * (x, y) は箱の中心（canvas ドット座標）。
 */
export function chestOpenFx(scene: Phaser.Scene, x: number, y: number): void {
  const cx = Math.round(x);
  const cy = Math.round(y);
  const img = scene.add.image(cx, cy, chestTexture(scene, "closed")).setScale(1).setDepth(25);
  const glow = scene.add.circle(cx, cy, 8, 0xffe66d, 0.35).setDepth(24);
  const done = (): void => {
    img.destroy();
    glow.destroy();
  };
  if (!fxEnabled()) {
    img.setTexture(chestTexture(scene, "open"));
    scene.time.delayedCall(1200, done);
    return;
  }
  glow.setAlpha(0);
  scene.time.delayedCall(IMPACT.chestClosedMs, () => {
    if (!img.active) return;
    img.setTexture(chestTexture(scene, "open"));
    glow.setAlpha(0.35);
    scene.tweens.add({
      targets: glow,
      scale: 1.6,
      alpha: 0,
      duration: IMPACT.chestGlowMs,
    });
  });
  scene.time.delayedCall(1200, done);
}
