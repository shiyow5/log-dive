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
 * マップに描く部屋か。訪問済み・今いる部屋の隣に加えて、開いた階段の部屋は未踏でも描く
 * （案B: roomSymbol が ▼ を返しても、部屋自体を描かなければ画面に出ないため）。
 */
export function isShownOnMap(r: RoomState, s: RunState): boolean {
  if (r.visited) return true;
  const here = s.floor.rooms.find((x) => x.id === s.roomId);
  if (here?.neighbors.includes(r.id)) return true;
  return r.content.kind === "stairs" && stairsOpen(s);
}

/**
 * 部屋の内容に応じた記号（色だけに頼らない）。
 *
 * 階段は開いている場合、未踏でも ▼ を出す（案B: spec-a §9 未踏隠しの例外）。
 *
 * | 内容 | 記号 |
 * |------|------|
 * | 階段（閉じている、未踏） | null |
 * | 階段（閉じている、既踏） | ◆ |
 * | 階段（開いている） | ▼ |
 * | 宝箱 | ♦ |
 * | ボス（バグあり） | ▲ |
 * | ボス（バグなし） | ★ |
 * | 通常バグ（あり） | × |
 * | 通常バグ（なし） | ✓ |
 * | 未踏の部屋（階段以外） | null |
 * | それ以外 | null |
 */
export function roomSymbol(r: RoomState, s: RunState): string | null {
  const c = r.content;
  // 階段: 開いていれば未踏でも ▼ を出す（案B）
  if (c.kind === "stairs") {
    return stairsOpen(s) ? "▼" : r.visited ? "◆" : null;
  }
  if (!r.visited) return null;
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
