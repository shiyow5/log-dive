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
