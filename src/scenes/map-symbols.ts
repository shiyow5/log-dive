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

/**
 * ラベルを短縮して返す。
 *
 * label が maxChars を超える場合は先頭 maxChars-1 文字 + "…" に短縮する。
 * @param label  - 元ラベル
 * @param maxChars - 最大文字数（省略時は 8）
 */
export function shortLabel(label: string, maxChars = 8): string {
  if (label.length <= maxChars) return label;
  return label.slice(0, maxChars - 1) + "\u2026"; // …
}

/** モノスペース 8px の1文字幅（px、少し大きめの概算）。 */
export const CHAR_W = 5;
/** 名前ラベルの高さ（8px フォント＋余白）。 */
export const NAME_H = 10;
/** これより短くしか出せないなら名前は出さない（"ab…" では読めないため）。 */
export const MIN_NAME_CHARS = 4;

const MIN_CELL = 8;
const BASE_ROOM_RATIO = 20 / 32;

export interface MapLayout {
  /** 1マスの間隔（px）。 */
  readonly CELL: number;
  /** 部屋の四角の一辺（px）。 */
  readonly ROOM: number;
  readonly ORIGIN_X: number;
  readonly ORIGIN_Y: number;
}

/**
 * マップの CELL/ROOM/原点を決める（ビューポート 320x180、下 100px は HUD）。
 * MapScene.drawMap とテストの両方がこれを使う（テスト側で式を写さない）。
 */
export function calcMapLayout(rooms: readonly RoomState[]): MapLayout {
  const width = 320;
  const mapW = Math.max(...rooms.map((r) => r.x)) + 1;
  const mapH = Math.max(...rooms.map((r) => r.y)) + 1;
  const availW = width - 40; // 左右マージン20px
  const availH = 180 - 20 - 100; // 上部マージン20 + HUD下部100px
  const CELL = Math.max(MIN_CELL, Math.min(Math.floor(availW / mapW), Math.floor(availH / mapH)));
  const ROOM = Math.max(4, Math.floor(CELL * BASE_ROOM_RATIO));
  return { CELL, ROOM, ORIGIN_X: Math.floor((width - mapW * CELL) / 2), ORIGIN_Y: 20 };
}

/**
 * 部屋の下に出す名前。未踏は「?」。訪問済みは1マスの幅に収まるよう短縮し、
 * 収まる文字数が MIN_NAME_CHARS 未満の密な階では出さない（null。部屋 ID は別に出る）。
 * MapScene はこの戻り値をそのまま描く。
 */
export function mapLabelText(r: RoomState, CELL: number): string | null {
  if (!r.visited) return "?";
  const maxChars = Math.floor(CELL / CHAR_W);
  if (maxChars < MIN_NAME_CHARS) return null;
  return shortLabel(r.label, maxChars);
}

type Rect = { x: number; y: number; w: number; h: number };

/** 名前ラベルが実際に描かれる矩形（px）。描かないなら null。幅は描く文字列の長さから出す。 */
export function labelRect(r: RoomState, layout: MapLayout): Rect | null {
  const text = mapLabelText(r, layout.CELL);
  if (text === null) return null;
  const cx = layout.ORIGIN_X + r.x * layout.CELL;
  const cy = layout.ORIGIN_Y + r.y * layout.CELL;
  const w = text.length * CHAR_W;
  // MapScene: text(x, y + ROOM / 2 + 2).setOrigin(0.5, 0)
  return { x: cx - w / 2, y: cy + layout.ROOM / 2 + 2, w, h: NAME_H };
}

/** 名前ラベル同士が重なる部屋の組（なければ空）。 */
export function labelCollisions(
  rooms: readonly RoomState[],
  layout: MapLayout,
): Array<[string, string]> {
  const rects = rooms
    .map((r) => ({ id: r.id, rect: labelRect(r, layout) }))
    .filter((x): x is { id: string; rect: Rect } => x.rect !== null);
  const hits: Array<[string, string]> = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i]!.rect, rects[j]!.rect)) hits.push([rects[i]!.id, rects[j]!.id]);
    }
  }
  return hits;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
