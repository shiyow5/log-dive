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

/** Color tokens for map symbols. */
export const COLORS = {
  hint: "#e8c468",
  accent: "#7ebeab",
  stairs: "#88c0d0",
  boss: "#b48ead",
  bug: "#ff6b5e",
  visited: "#e4f1ec",
  bg: "#0f1a1c",
} as const;

/** マップ図形の色（#89 minori 指定。背景 COLORS.bg 比は tests/unit/map-labels.test.ts で検証）。 */
export const MAP_SHAPE_COLORS = {
  /** 接続線・未踏部屋の枠（1px）。3.82:1 */
  line: "#5a7a80",
  /** 訪問済み部屋の塗り。単体では 3:1 に届かない（1.86:1）ので枠線と併用する */
  visitedFill: "#33494e",
  /** 訪問済み部屋の枠（1px）。7.07:1 */
  visitedEdge: "#8fa9a3",
} as const;

/** 記号の色。 */
export function symbolColor(r: RoomState): string {
  const c = r.content;
  if (c.kind === "chest") return COLORS.hint;
  if (c.kind === "stairs") return COLORS.stairs;
  if (c.kind === "bug") return c.boss ? COLORS.boss : COLORS.bug;
  return COLORS.visited;
}

/** キャンバス内の部屋 ID のフォントサイズ（内部 px。minori 指定: 10px 以上、8px は禁止。#88）。 */
export const ID_FONT_PX = 10;
/** 部屋 ID の1文字幅（px、10px フォントの概算）。 */
export const CHAR_W = 6;
/** ID の文字の高さ（px、衝突判定用）。 */
export const ID_H = 8;
/** 未踏マーク「?」の大きさ（px。6×10。10px フォント）。未踏の箱の中央に置く（#114: 下の段のラベルと重ならない）。 */
export const UNKNOWN_W = 6;
export const UNKNOWN_H = 10;

/** CELL の下限（全階で維持。密な階は #66 の ID 規則）と上限（minori 指定 #89: 疎な階は最大 24px）。 */
export const MIN_CELL = 12;
export const MAX_CELL = 24;
/**
 * 横持ちのマップ領域の既定値（内部 px、minori 指定 #89）。下端は既定で y=106 だが、
 * 実際の下端は MapScene が HUD パネルの実測位置から求めて `mapBottom` で渡す（HUD の高さは画面サイズで変わるため）。
 * 部屋の塊はこの領域の水平・垂直とも中央に置く（上偏りをなくす）。
 */
export const MAP_AREA_TOP = 6;
export const MAP_AREA_H = 100;
const BASE_ROOM_RATIO = 20 / 32;
/** 疎な階（CELL>=DENSE_CELL）の箱の比率。箱の下に 10px の ID を置く隙間（CELL-ROOM >= 10）を空けるため小さめ。 */
const SPARSE_ROOM_RATIO = 1 / 2;

export interface MapLayoutOptions {
  /** マップに使える高さ（内部px）。省略時は横長の既定値（60px）。指定時は canvas 全高（縦持ちは PORTRAIT_AVAIL_H）。 */
  readonly availH?: number;
  /**
   * 横持ちでマップを置いてよい下端（内部px）。HUD パネルの上端より上に収めるため MapScene が実測して渡す。
   * 省略時は既定の下端（MAP_AREA_TOP + MAP_AREA_H）。
   */
  readonly mapBottom?: number;
}
/** 縦持ち（aspect<1）の canvas 内部高さの下限（横持ちと同じ 180）。HUD が極端に高い画面でもここで止める（HUD 側がスクロール）。 */
export const PORTRAIT_AVAIL_H = 180;
/**
 * 縦持ちのマップ領域の上マージン（内部 px）。右上の音ボタン（44px＋余白 8px ≒ 52 画面px）と
 * 最上段の部屋が重ならない高さ（44 × 390/320 ≒ 54 画面px）。
 */
const PORTRAIT_MAP_TOP = 44;
/**
 * 縦持ちの CELL の上限（内部 px）。疎な階（3×2 など）で canvas の上下が黒く空くのを防ぐため 80 にする。
 * 幅・高さのどちらかが埋まった時点で止まるので、横幅いっぱいの階が間延びすることはない（#121 残件）。
 */
export const PORTRAIT_MAX_CELL = 80;
/**
 * 縦持ちの部屋の比率。ROOM = CELL × 0.65。CELL=46（6 列の階）で ROOM=29 内部px
 * ＝ 幅 360〜430 の画面で約 32〜39 画面px（#121: 32px 以上）。箱の下の隙間はラベル（12px）が入る高さ。
 */
const PORTRAIT_ROOM_RATIO = 0.65;
/** 縦持ちのラベルのフォントサイズ（内部 px）。画面幅 390 で約 14.6px、幅 320 でも 12px。 */
export const PORTRAIT_ID_FONT_PX = 12;
/** 縦持ちのラベル1文字の幅（内部 px、12px フォントの概算）。 */
export const PORTRAIT_CHAR_W = 7;
/** 縦持ちのラベルの文字高（内部 px、衝突判定と下端計算用）。 */
export const PORTRAIT_ID_H = 14;
/** 縦持ちの下マージン（内部 px）。 */
const PORTRAIT_BOTTOM_GAP = 8;

/**
 * 縦持ちのマップ画面で canvas の内部高さ（px。幅は 320 固定）を決める（#121）。
 * canvas の下に HUD（高さ hudH 画面px）が入るので、画面高から HUD を引いた残り全部を canvas に使う。
 * 戻り値は内部 px なので、表示の高さは「戻り値 × 画面幅 / 320」。画面に収まるよう切り捨てる。
 * 下限は PORTRAIT_AVAIL_H（HUD が高すぎるときは HUD 側がスクロールする）。
 */
export function portraitCanvasH(viewW: number, viewH: number, hudH: number): number {
  if (viewW <= 0 || viewH <= 0) return PORTRAIT_AVAIL_H;
  const h = Math.floor(((viewH - Math.max(0, hudH)) * 320) / viewW);
  return Math.max(PORTRAIT_AVAIL_H, h);
}

export interface MapLayout {
  /** 1マスの間隔（px）。 */
  readonly CELL: number;
  /** 部屋の四角の一辺（px）。 */
  readonly ROOM: number;
  readonly ORIGIN_X: number;
  readonly ORIGIN_Y: number;
  /** ラベル1文字の幅（px）。省略時は CHAR_W（横持ち）。縦持ちは PORTRAIT_CHAR_W。 */
  readonly charW?: number;
  /** ラベルの文字高（px）。省略時は ID_H（横持ち）。縦持ちは PORTRAIT_ID_H。 */
  readonly idH?: number;
}

/**
 * マップの CELL/ROOM/原点を決める（ビューポート 320x180、下 100px は HUD）。
 * MapScene.drawMap とテストの両方がこれを使う（テスト側で式を写さない）。
 */
export function calcMapLayout(rooms: readonly RoomState[], opts?: MapLayoutOptions): MapLayout {
  const width = 320;
  const mapW = Math.max(...rooms.map((r) => r.x)) + 1;
  const mapH = Math.max(...rooms.map((r) => r.y)) + 1;
  const availW = width - 40; // 左右マージン20px
  const portraitH = opts?.availH;
  // 縦持ち（#121）: HUD が canvas の外（下）なので、上マージン（音ボタンを避ける）と最下段のラベルを引いた全高を使う。
  //   CELL の上限は PORTRAIT_MAX_CELL、箱は PORTRAIT_ROOM_RATIO（ラベルを入れる隙間を残しつつ大きく）。
  if (portraitH !== undefined) {
    const availPH = portraitH - PORTRAIT_MAP_TOP - PORTRAIT_ID_H - PORTRAIT_BOTTOM_GAP;
    const raw = Math.min(Math.floor(availW / mapW), Math.floor(availPH / mapH));
    const CELL = Math.max(MIN_CELL, Math.min(PORTRAIT_MAX_CELL, raw));
    // 箱の下にラベル（PORTRAIT_ID_H）が入る隙間を必ず残す（HUD が極端に高く CELL が小さい画面の保険）
    const ROOM = Math.max(
      4,
      Math.min(Math.floor(CELL * PORTRAIT_ROOM_RATIO), CELL - PORTRAIT_ID_H),
    );
    const ORIGIN_X = Math.floor((width - (mapW - 1) * CELL - ROOM) / 2) + Math.floor(ROOM / 2);
    // 余った高さは上下に振り分けて、マップを領域の縦の中央に置く
    const free = Math.max(0, availPH - ((mapH - 1) * CELL + ROOM));
    return {
      CELL,
      ROOM,
      ORIGIN_X,
      ORIGIN_Y: PORTRAIT_MAP_TOP + Math.floor(free / 2) + Math.floor(ROOM / 2),
      charW: PORTRAIT_CHAR_W,
      idH: PORTRAIT_ID_H,
    };
  }
  // 横持ち: マップ領域 MAP_AREA_H に収める（#89）。領域: 上端 MAP_AREA_TOP、下端 mapBottom（HUD の上端を避けた値）。
  const areaH = (opts?.mapBottom ?? MAP_AREA_TOP + MAP_AREA_H) - MAP_AREA_TOP;
  const raw = Math.min(Math.floor(availW / mapW), Math.floor(areaH / mapH));
  // 領域が足りない短い画面でも CELL は MIN_CELL で止める（それ以上縮めると判読できない）
  const CELL = Math.max(MIN_CELL, Math.min(MAX_CELL, raw));
  const ratio = CELL >= DENSE_CELL ? SPARSE_ROOM_RATIO : BASE_ROOM_RATIO;
  const ROOM = Math.max(4, Math.floor(CELL * ratio));
  const ORIGIN_X = Math.floor((width - (mapW - 1) * CELL - ROOM) / 2) + Math.floor(ROOM / 2);
  // 箱の上端〜最下段のラベル下端（疎な階のみ。ROOM の下に ID_H）を領域内で垂直中央に置く
  const extent = (mapH - 1) * CELL + ROOM + (CELL >= DENSE_CELL ? ID_H : 0);
  const top = MAP_AREA_TOP + Math.max(0, Math.floor((areaH - extent) / 2));
  return { CELL, ROOM, ORIGIN_X, ORIGIN_Y: top + Math.floor(ROOM / 2) };
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
  // 縦持ち（charW 指定）の疎な階は箱の中央に 10×10 の記号を置くので、箱が 10px 未満（HUD が極端に高い画面）なら出さない
  if (layout.charW !== undefined && !isDense(layout)) return layout.ROOM >= 10;
  return !isDense(layout) || layout.CELL - layout.ROOM >= DENSE_SYM_W + 1;
}
export function isDense(layout: MapLayout): boolean {
  return layout.CELL < DENSE_CELL;
}

/**
 * 探索済みの部屋の関数名ラベル（#114）。部屋 ID（r0 等）はキャンバスに出さない。
 * "config.read()" → "read"（モジュール名と () を省く）。箱の幅（CELL）に収まる文字数で切る。
 * 未踏・密な階は null（未踏は「?」、密な階は箱が小さく文字が入らないため記号と枠色で区別）。
 */
export function roomLabelText(r: RoomState, layout: MapLayout, isHere = false): string | null {
  if (!r.visited || isDense(layout)) return null;
  const name = r.label.replace(/\(\)$/, "").split(".").pop() ?? "";
  const max = Math.max(1, Math.floor((layout.CELL - 2) / (layout.charW ?? CHAR_W)));
  // 縦持ち（charW 指定）の現在地は名前を省略しない（#121）。ただし箱の幅（CELL-2）に収まるときだけ。
  // 収まらない小さい画面では省略して、隣の部屋のラベルと重ならないようにする（Codex P2）
  if (isHere && layout.charW !== undefined && name.length * layout.charW <= layout.CELL - 2)
    return name;
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/**
 * 部屋の四角・ラベル・記号・未踏「?」が描かれる矩形（px、近似）。MapScene の配置と同じ式。
 * 密な階: ラベルなし、記号=箱の右隣（中央揃え縦）。
 * 疎な階: ラベル（探索済みのみ、関数名）=箱の真下に中央揃え（#114）、記号=箱の中央。
 * isHere: 現在地の部屋か（縦持ちは名前を省略しないので、その幅で判定する）。
 * 未踏「?」（疎な階のみ）は箱の中央（箱が接続線を隠す）。
 */
export function partRects(
  r: RoomState,
  layout: MapLayout,
  hasSymbolIn: boolean,
  isHere = false,
): { box: Rect; id: Rect | null; symbol: Rect | null; unknown: Rect | null } {
  const cx = layout.ORIGIN_X + r.x * layout.CELL;
  const cy = layout.ORIGIN_Y + r.y * layout.CELL;
  const R = layout.ROOM;
  const hasSymbol = hasSymbolIn && symbolFits(layout);
  const box = { x: cx - R / 2, y: cy - R / 2, w: R, h: R };
  // 描画（MapScene）と同じ引数で文字列を決める。現在地は全部出すので、その幅で重なりを判定する
  const text = roomLabelText(r, layout, isHere);
  const idW = (text?.length ?? 0) * (layout.charW ?? CHAR_W);
  // 密な階は上の段の ID と干渉するので「?」は出さない（未踏は暗い箱＋弱い色の ID で区別）
  const unknown =
    r.visited || isDense(layout) || hasSymbol
      ? null
      : {
          x: cx - UNKNOWN_W / 2,
          y: cy - UNKNOWN_H / 2,
          w: UNKNOWN_W,
          h: UNKNOWN_H,
        };
  if (isDense(layout)) {
    return {
      box,
      id: null,
      symbol: hasSymbol ? { x: cx + R / 2 + 1, y: cy - 4, w: DENSE_SYM_W, h: 8 } : null,
      unknown,
    };
  }
  return {
    box,
    id: text ? { x: cx - idW / 2, y: cy + R / 2, w: idW, h: layout.idH ?? ID_H } : null,
    symbol: hasSymbol ? { x: cx - 5, y: cy - 5, w: 10, h: 10 } : null,
    unknown,
  };
}

/** 隣・下の部屋の四角や記号と重なる要素の組（なければ空）。ID が自分の箱からはみ出す場合も検出。 */
export function partCollisions(
  rooms: readonly RoomState[],
  layout: MapLayout,
  hasSymbol: (r: RoomState) => boolean,
  currentId?: string,
): string[] {
  const hits: string[] = [];
  const parts = rooms.map((r) => ({
    rid: r.id,
    ...partRects(r, layout, hasSymbol(r), r.id === currentId),
  }));
  for (const a of parts) {
    for (const b of parts) {
      if (a === b) continue;
      for (const [an, ar] of [
        ["id", a.id],
        ["sym", a.symbol],
        ["unk", a.unknown],
      ] as const) {
        if (!ar) continue;
        for (const [bn, br] of [
          ["box", b.box],
          ["id", b.id],
          ["sym", b.symbol],
          ["unk", b.unknown],
        ] as const) {
          if (br && rectsOverlap(ar, br)) hits.push(`${a.rid}.${an}x${b.rid}.${bn}`);
        }
      }
    }
  }
  return hits;
}

type Rect = { x: number; y: number; w: number; h: number };

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
