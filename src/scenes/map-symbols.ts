/**
 * マップ上の部屋記号（color-independent）。
 *
 * MapScene.ts と同じロジックを Phaser に依存しない形で分離した。
 * unit テストで検証できるように export している。
 */
import { floorCount } from "../core/floor";
import type { RoomState, RunState } from "../core/run";

/** その階のバグが全部閉じていて、階段で次の階へ進めるか。 */
export function stairsOpen(state: RunState): boolean {
  return state.floor.number < floorCount() && !hasBugsLeft(state.floor);
}

function hasBugsLeft(floor: RunState["floor"]): boolean {
  return floor.rooms.some((r) => r.content.kind === "bug" && r.content.bugs.length > 0);
}

/**
 * 部屋の内容に応じた記号（色だけに頼らない）。未踏部屋は記号なし。
 *
 * | 内容 | 記号 |
 * |------|------|
 * | 階段（閉じている） | ◆ |
 * | 階段（開いている） | ▼ |
 * | 宝箱 | ♦ |
 * | ボス（バグあり） | ▲ |
 * | ボス（バグなし） | ★ |
 * | 通常バグ（あり） | × |
 * | 通常バグ（なし） | ✓ |
 * | 未踏の部屋 | null |
 * | それ以外 | null |
 */
export function roomSymbol(r: RoomState, s: RunState): string | null {
  if (!r.visited) return null;
  const c = r.content;
  if (c.kind === "stairs") {
    return stairsOpen(s) ? "▼" : "◆";
  }
  if (c.kind === "chest") {
    return "♦";
  }
  if (c.kind === "bug") {
    if (c.boss) {
      return c.bugs.length > 0 ? "▲" : "★";
    }
    return c.bugs.length > 0 ? "×" : "✓";
  }
  return null;
}

/** 記号の色。 */
export function symbolColor(r: RoomState): string {
  const c = r.content;
  if (c.kind === "chest") return "#f0c040";
  if (c.kind === "stairs") return "#88c0d0";
  if (c.kind === "bug") return c.boss ? "#b48ead" : "#ff6b5e";
  return "#e4f1ec";
}

/** ラベルを短縮して返す。8文字以内ならそのまま、超える場合は先頭7文字+"…"。 */
export function shortLabel(label: string): string {
  if (label.length <= 8) return label;
  return label.slice(0, 7) + "\u2026"; // …
}

/**
 * 部屋がマップ上で表示される矩形（px座標）を計算する。
 *
 * @param r - 部屋状態
 * @param CELL - マスサイズ
 * @param ROOM - 部屋描画サイズ
 * @param ORIGIN_X - グリッド原点X
 * @param ORIGIN_Y - グリッド原点Y
 * @param nameHeight - 名前テキストの高さ(px、デフォルト 10)
 */
export function roomRect(
  r: RoomState,
  CELL: number,
  ROOM: number,
  ORIGIN_X: number,
  ORIGIN_Y: number,
  nameHeight = 10,
): { x: number; y: number; w: number; h: number } {
  const cx = ORIGIN_X + r.x * CELL;
  const cy = ORIGIN_Y + r.y * CELL;
  // 部屋四角 + 記号 + 名前テキスト
  const symH = 12; // 記号の高さ
  return {
    x: cx - CELL / 2,
    y: cy - ROOM / 2 - symH, // 記号まで含む
    w: CELL,
    h: ROOM + symH + nameHeight, // 部屋+記号+名前
  };
}

/**
 * 4シード全階で部屋ラベルが重ならないことを検査する純関数。
 *
 * `rooms` に `roomRect` を適用して全矩形のペアが交差しなければ true。
 */
export function checkLabelCollision(
  rooms: readonly RoomState[],
  CELL: number,
  ROOM: number,
  ORIGIN_X: number,
  ORIGIN_Y: number,
): boolean {
  const rects: { x: number; y: number; w: number; h: number }[] = rooms.map((r) =>
    roomRect(r, CELL, ROOM, ORIGIN_X, ORIGIN_Y),
  );
  for (let i = 0; i < rects.length; i++) {
    const ri = rects[i]!;
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(ri, rects[j]!)) return true;
    }
  }
  return false;
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
