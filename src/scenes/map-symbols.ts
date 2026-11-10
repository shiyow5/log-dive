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

/** これより CELL が小さい階は「密」。ID を箱の中、記号を箱の右隣に置く（上下に余白がないため）。 */
export const DENSE_CELL = 20;
/**
 * 密な階の記号が占める幅。DotGothic16 の 7px フォントは ◆▼♦▲★ の送り幅が 7px なので、
 * 実測 7px + 余白 1px = 8px。箱の右隣の隙間(CELL-ROOM)に収める。
 * symbolFits（出す/出さない）と partRects（衝突判定の矩形）の両方がこの値を使う。
 */
export const DENSE_SYM_W = 8;
/** 密な階で記号を箱の右隣に置けるか（隙間 CELL-ROOM が足りないほど密なら出さない。枠色で区別は残る）。 */
export function symbolFits(layout: MapLayout): boolean {
  return !isDense(layout) || layout.CELL - layout.ROOM >= DENSE_SYM_W + 1;
}
export function isDense(layout: MapLayout): boolean {
  return layout.CELL < DENSE_CELL;
}

/** 部屋 ID の表示文字列。密な階は数字のみ（"r12" → "12"）。 */
export function roomIdText(id: string, layout: MapLayout): string {
  return isDense(layout) ? id.replace(/^\D+/, "") : id;
}

/**
 * 部屋の四角・ID・記号が描かれる矩形（px、近似）。MapScene の配置と同じ式。
 * 密な階: ID=箱の中央、記号=箱の右隣（中央揃え縦）。疎な階: ID=右上、記号=箱の上。
 */
export function partRects(
  r: RoomState,
  layout: MapLayout,
  hasSymbolIn: boolean,
): { box: Rect; id: Rect; symbol: Rect | null } {
  const cx = layout.ORIGIN_X + r.x * layout.CELL;
  const cy = layout.ORIGIN_Y + r.y * layout.CELL;
  const R = layout.ROOM;
  const hasSymbol = hasSymbolIn && symbolFits(layout);
  const box = { x: cx - R / 2, y: cy - R / 2, w: R, h: R };
  const idW = roomIdText(r.id, layout).length * CHAR_W;
  if (isDense(layout)) {
    return {
      box,
      id: { x: cx - idW / 2, y: cy - 4, w: idW, h: 8 },
      symbol: hasSymbol ? { x: cx + R / 2 + 1, y: cy - 4, w: DENSE_SYM_W, h: 8 } : null,
    };
  }
  return {
    box,
    id: { x: cx + R / 2 - 2 - idW, y: cy - R / 2 + 2, w: idW, h: 8 },
    symbol: hasSymbol ? { x: cx - CHAR_W, y: cy - R / 2 - 2, w: 2 * CHAR_W, h: 10 } : null,
  };
}

/** 隣・下の部屋の四角や記号と重なる要素の組（なければ空）。ID が自分の箱からはみ出す場合も検出。 */
export function partCollisions(
  rooms: readonly RoomState[],
  layout: MapLayout,
  hasSymbol: (r: RoomState) => boolean,
): string[] {
  const hits: string[] = [];
  const parts = rooms.map((r) => ({ rid: r.id, ...partRects(r, layout, hasSymbol(r)) }));
  for (const a of parts) {
    for (const b of parts) {
      if (a === b) continue;
      for (const [an, ar] of [
        ["id", a.id],
        ["sym", a.symbol],
      ] as const) {
        if (!ar) continue;
        for (const [bn, br] of [
          ["box", b.box],
          ["id", b.id],
          ["sym", b.symbol],
        ] as const) {
          if (br && rectsOverlap(ar, br)) hits.push(`${a.rid}.${an}x${b.rid}.${bn}`);
        }
      }
    }
  }
  return hits;
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
