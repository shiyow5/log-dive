import type Phaser from "phaser";
import { BUG_SPRITE_PALETTE, BUG_SPRITE_ROWS, BUG_SPRITE_SIZE } from "./bug-sprite";

/**
 * 敵（バグ）のドット絵 16x16。通常 3 種＋ボス 1 種。開発チーム（rio）の自作（CREDITS.md 参照）。
 * 各種 2 フレーム: idle（待機）と hit（被弾）。待機の上下ゆれは BattleScene 側で付ける。
 *
 * 正体（BugId）は画面に出さないルール。種類を BugId と対応させると推理のヒントになるので、
 * 通常 3 種は部屋 ID から決める（見た目は飾り。種別は症状テキストで見分ける）。
 * 文字 = 色の対応は各 palette。"." は透明。
 */
export const ENEMY_SIZE = BUG_SPRITE_SIZE;

export type EnemyKind = "bug" | "blob" | "ghost" | "boss";
export const NORMAL_KINDS: readonly EnemyKind[] = ["bug", "blob", "ghost"];

export interface EnemySprite {
  readonly palette: Readonly<Record<string, number>>;
  readonly idle: readonly string[];
  readonly hit: readonly string[];
}

/** idle の指定行だけ差し替えて hit フレームを作る。 */
function withRows(base: readonly string[], rows: Readonly<Record<number, string>>): string[] {
  return base.map((r, i) => rows[i] ?? r);
}

const BLOB_IDLE = [
  "................",
  "................",
  "................",
  ".....oooooo.....",
  "...oobbbbbboo...",
  "..obhhbbbbbbbo..",
  "..obhbbbbbbbbo..",
  ".obbbbbbbbbbbbo.",
  ".obbwwbbbbwwbbo.",
  ".obbwkbbbbwkbbo.",
  ".obbbbbbbbbbbbo.",
  ".obbbboooobbbbo.",
  ".oabbbbbbbbbbao.",
  ".oaabbbbbbbbaao.",
  "..oaaaaaaaaaao..",
  "...oooooooooo...",
];

const GHOST_IDLE = [
  "................",
  "......oooo......",
  "....oohhhhoo....",
  "...ohhbbbbbho...",
  "...ohbbbbbbbo...",
  "..ohbwwbbwwbbo..",
  "..ohbwkbbwkbbo..",
  "..obbbbbbbbbbo..",
  "..obbbboobbbbo..",
  "..obbbbbbbbbbo..",
  "..oabbbbbbbbao..",
  "..oabbobbobbao..",
  "..oaboobboobao..",
  "..ooo.oaao.ooo..",
  ".....oo..oo.....",
  "................",
];

const BOSS_IDLE = [
  "o..............o",
  "oo............oo",
  "ooo..........ooo",
  "oyo.oooooooo.oyo",
  ".oooobbbbbbooo..",
  "..obbhhbbbbbbo..",
  "..obbbbbbbbbbo..",
  ".obwwwbbbbwwwbo.",
  ".obwykbbbbwykbo.",
  ".obbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbo.",
  ".obboooooooobbo.",
  ".obbowyowyowbbo.",
  "..obbowwwwwobo..",
  "...oobbbbbboo...",
  ".....oooooo.....",
];

export const ENEMY_SPRITES: Readonly<Record<EnemyKind, EnemySprite>> = {
  bug: {
    palette: BUG_SPRITE_PALETTE,
    idle: BUG_SPRITE_ROWS,
    // 目を閉じて「><」にする
    hit: withRows(BUG_SPRITE_ROWS, {
      5: "...orrrrrrrrro..",
      6: "o..orkrrrrrkrro.",
    }),
  },
  blob: {
    palette: { o: 0x2c3f6e, b: 0x6fa8ff, h: 0xbcd8ff, a: 0x4a74c9, w: 0xe4f1ec, k: 0x0c0e14 },
    idle: BLOB_IDLE,
    hit: withRows(BLOB_IDLE, {
      8: ".obbkbbbbbbkbbo.",
      9: ".obbbkbbbbkbbbo.",
      11: ".obbboooooobbbo.",
    }),
  },
  ghost: {
    palette: { o: 0x4a2a6e, b: 0xc79bff, h: 0xe8d4ff, a: 0x9468d6, w: 0xe4f1ec, k: 0x0c0e14 },
    idle: GHOST_IDLE,
    hit: withRows(GHOST_IDLE, {
      5: "..ohbkbbbbkbbbo.",
      6: "..ohbbkbbkbbbbo.",
      8: "..obbboooobbbo..",
    }),
  },
  boss: {
    palette: { o: 0x3a0f1c, b: 0xb3303f, h: 0xff6b5e, w: 0xe4f1ec, k: 0x0c0e14, y: 0xffd166 },
    idle: BOSS_IDLE,
    hit: withRows(BOSS_IDLE, {
      7: ".obkkwbbbbwkkbo.",
      8: ".obbkkbbbbkkbbo.",
    }),
  },
};

/** 部屋 ID から通常敵の見た目を決める（BugId と無関係・同じ部屋は毎回同じ）。 */
export function enemyKindFor(roomId: string, boss: boolean): EnemyKind {
  if (boss) return "boss";
  let h = 0;
  for (const ch of roomId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NORMAL_KINDS[h % NORMAL_KINDS.length] ?? "bug";
}

export type EnemyFrame = "idle" | "hit";
export const enemyTextureKey = (kind: EnemyKind, frame: EnemyFrame): string =>
  `enemy-${kind}-${frame}`;

/** Phaser のテクスチャとして登録する（既にあれば何もしない）。 */
export function ensureEnemyTextures(textures: Phaser.Textures.TextureManager): void {
  for (const kind of Object.keys(ENEMY_SPRITES) as EnemyKind[]) {
    const spr = ENEMY_SPRITES[kind];
    for (const frame of ["idle", "hit"] as const) {
      const key = enemyTextureKey(kind, frame);
      if (textures.exists(key)) continue;
      const tex = textures.createCanvas(key, ENEMY_SIZE, ENEMY_SIZE);
      if (!tex) continue;
      const ctx = tex.getContext();
      spr[frame].forEach((row, y) => {
        [...row].forEach((ch, x) => {
          const c = spr.palette[ch];
          if (c === undefined) return;
          ctx.fillStyle = `#${c.toString(16).padStart(6, "0")}`;
          ctx.fillRect(x, y, 1, 1);
        });
      });
      tex.refresh();
      tex.setFilter(1 /* Phaser.Textures.FilterMode.NEAREST */);
    }
  }
}
