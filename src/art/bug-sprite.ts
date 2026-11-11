import type Phaser from "phaser";

/**
 * 敵（バグ）の 16x16 ドット絵。開発チーム（rio）の自作・CC0 相当（CREDITS.md 参照）。
 * 正体（BugId）は画面に出さないルールなので、全バグ共通の「正体不明の虫」1種類を使う。
 * 種別ごとに形を変えると推理のヒントになってしまうため、種別は症状テキストで見分ける。
 *
 * 文字 = 色の対応は PALETTE。"." は透明。
 */
export const BUG_SPRITE_SIZE = 16;

export const BUG_SPRITE_PALETTE: Readonly<Record<string, number>> = {
  o: 0x7a2a26, // 輪郭・影（暗い赤）
  r: 0xff6b5e, // 体（コーラル。HP バーと同色）
  l: 0xffa89f, // ハイライト
  w: 0xe4f1ec, // 目の白
  k: 0x0c0e14, // 瞳（背景色）
};

export const BUG_SPRITE_ROWS: readonly string[] = [
  "..o..........o..",
  "...o........o...",
  "....o..oo..o....",
  ".....oorrrro....",
  "....orllrrrro...",
  "...orwwrrwwrro..",
  "o..orwkrrwkrro.o",
  ".o.orrrrrrrrro.o",
  "..oorrrooorrroo.",
  "o..orrrrrrrrro.o",
  ".o.orrrrrrrrro..",
  "..oorrooooorroo.",
  "o..orro..orro..o",
  ".o.oro....oro.o.",
  "...oo......oo...",
  "..oo........oo..",
];

/** Phaser のテクスチャとして登録する（既にあれば何もしない）。 */
export function ensureBugTexture(textures: Phaser.Textures.TextureManager, key: string): void {
  if (textures.exists(key)) return;
  const tex = textures.createCanvas(key, BUG_SPRITE_SIZE, BUG_SPRITE_SIZE);
  if (!tex) return;
  const ctx = tex.getContext();
  BUG_SPRITE_ROWS.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const c = BUG_SPRITE_PALETTE[ch];
      if (c === undefined) return;
      ctx.fillStyle = `#${c.toString(16).padStart(6, "0")}`;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  tex.refresh();
}
