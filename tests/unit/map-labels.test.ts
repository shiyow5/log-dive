import { describe, expect, it } from "vitest";
import {
  DENSE_SYM_W,
  MAP_AREA_H,
  MAP_AREA_TOP,
  MAP_SHAPE_COLORS,
  COLORS,
  MAX_CELL,
  MIN_CELL,
  CHAR_W,
  ID_FONT_PX,
  PORTRAIT_AVAIL_H,
  UNKNOWN_H,
  UNKNOWN_W,
  calcMapLayout,
  partCollisions,
  partRects,
  portraitCanvasH,
  roomLabelText,
  symbolFits,
} from "../../src/scenes/map-symbols";
import { floorCount, generateFloor } from "../../src/core/floor";
import type { RoomState } from "../../src/core/run";

function room(id: string, x: number, y: number, visited = false): RoomState {
  return { id, label: "main()", x, y, neighbors: [], visited, content: { kind: "empty" } };
}

const at = (CELL: number, ROOM = Math.floor(CELL / 2)) => ({
  CELL,
  ROOM,
  ORIGIN_X: 20,
  ORIGIN_Y: 20,
});

describe("部屋 ID・未踏「?」の配置（#88）", () => {
  it("内部フォントは 10px 以上（8px 禁止）", () => {
    expect(ID_FONT_PX).toBeGreaterThanOrEqual(10);
  });

  it("未踏「?」は 6×10px で、未踏の箱の中央に収まる（#114）", () => {
    expect([UNKNOWN_W, UNKNOWN_H]).toEqual([6, 10]);
    for (const CELL of [20, 30]) {
      const { box, unknown } = partRects(room("r1", 2, 2), at(CELL), false);
      expect(unknown).not.toBeNull();
      const u = unknown!;
      expect(u.x + u.w / 2).toBe(box.x + box.w / 2);
      expect(u.y + u.h / 2).toBe(box.y + box.h / 2);
      expect(u.w).toBeLessThanOrEqual(box.w);
      expect(u.h).toBeLessThanOrEqual(box.h);
    }
  });

  it("密な階（CELL<20）は「?」を出さない（上の段の ID と干渉するため）", () => {
    expect(partRects(room("r1", 0, 0), at(15), false).unknown).toBeNull();
  });

  it("疎な階は箱の下に ID を置く隙間（CELL-ROOM >= 10）がある", () => {
    for (let i = 0; i < 50; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const layout = calcMapLayout(generateFloor(`seed-${i}`, n).rooms);
        if (layout.CELL >= 20) expect(layout.CELL - layout.ROOM).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("記号（開いた階段の ▼ など）が出る未踏部屋は「?」を重ねない（#114 Codex P2）", () => {
    const { symbol, unknown } = partRects(room("r1", 1, 1), at(30), true);
    expect(symbol).not.toBeNull();
    expect(unknown).toBeNull();
  });

  it("訪問済みの部屋は「?」を持たない", () => {
    expect(partRects(room("r1", 0, 0, true), at(30), false).unknown).toBeNull();
  });

  it("疎な階の探索済みの部屋は関数名ラベルを箱の真下に中央揃えで置く（#114）", () => {
    const layout = at(30);
    const { box, id } = partRects(room("r3", 1, 1, true), layout, false);
    expect(id).not.toBeNull();
    expect(id!.y).toBe(box.y + box.h);
    expect(id!.x + id!.w / 2).toBe(box.x + box.w / 2);
  });

  it("部屋 ID（r0 等）はラベルに出さない。未踏と密な階はラベルなし（#114）", () => {
    const layout = at(30);
    const label = (r: RoomState, l = layout) => roomLabelText(r, l);
    const named = { ...room("r7", 0, 0, true), label: "config.read()" };
    expect(label(named)).toBe("read");
    expect(label({ ...named, visited: false })).toBeNull();
    expect(label(named, at(15))).toBeNull();
    // 長い名前は CELL に収まる文字数で切る
    const long = { ...named, label: "parseConfigLine()" };
    expect(label(long)!.length * CHAR_W).toBeLessThanOrEqual(layout.CELL - 2);
  });

  it("縦持ちはマップの高さが広がり、同じ階で CELL が小さくならない（#114）", () => {
    for (let i = 0; i < 50; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms;
        const land = calcMapLayout(rooms);
        const port = calcMapLayout(rooms, { availH: PORTRAIT_AVAIL_H });
        expect(port.CELL).toBeGreaterThanOrEqual(land.CELL);
      }
    }
  });

  it("縦持ちは最下段のラベル下端が canvas 全高（PORTRAIT_AVAIL_H）に収まる（Codex P2）", () => {
    for (let i = 0; i < 100; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms.map((r) => ({ ...r, visited: true }));
        const l = calcMapLayout(rooms, { availH: PORTRAIT_AVAIL_H });
        for (const r of rooms) {
          const { id, box } = partRects(r, l, false);
          const bottom = id ? id.y + id.h : box.y + box.h;
          expect(bottom, `seed-${i} floor=${n} ${r.id}`).toBeLessThanOrEqual(PORTRAIT_AVAIL_H);
        }
      }
    }
  });
});

describe("縦持ちの canvas 高さ（#121）", () => {
  it("390×844 では画面高の約45%（内部 312px）を canvas に割く", () => {
    expect(portraitCanvasH(390, 844)).toBe(312);
  });

  it("横持ち相当の小さい値・不正値は PORTRAIT_AVAIL_H（180）に戻る", () => {
    expect(portraitCanvasH(0, 0)).toBe(PORTRAIT_AVAIL_H);
    expect(portraitCanvasH(390, 200)).toBe(PORTRAIT_AVAIL_H);
  });

  it("極端に縦長の画面でも 360 で止める", () => {
    expect(portraitCanvasH(320, 2000)).toBe(360);
  });
});

describe("縦持ちの高さを canvas に広げたときの配置（#121）", () => {
  it("canvas を伸ばした高さで、マップの下端は canvas の内側に収まる", () => {
    for (let i = 0; i < 50; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms.map((r) => ({ ...r, visited: true }));
        const h = portraitCanvasH(390, 844);
        const l = calcMapLayout(rooms, { availH: h });
        for (const r of rooms) {
          const { id, box } = partRects(r, l, false);
          const bottom = id ? id.y + id.h : box.y + box.h;
          expect(bottom, `seed-${i} floor=${n} ${r.id}`).toBeLessThanOrEqual(h);
        }
      }
    }
  });

  it("canvas が高いほどマップは大きくなり（CELL は下がらない）、縦の中央に寄る", () => {
    const rooms = generateFloor("seed-4", 3).rooms;
    const short = calcMapLayout(rooms, { availH: PORTRAIT_AVAIL_H });
    const tall = calcMapLayout(rooms, { availH: portraitCanvasH(390, 844) });
    expect(tall.CELL).toBeGreaterThanOrEqual(short.CELL);
    expect(tall.ORIGIN_Y).toBeGreaterThanOrEqual(short.ORIGIN_Y);
  });
});

describe("横持ちの下端（HUD の上端を避ける）", () => {
  it("mapBottom より下に部屋・ラベルを出さない（seed-4 floor2 は HUD 上端 86px の例）", () => {
    const rooms = generateFloor("seed-4", 2).rooms;
    for (const visited of [true, false]) {
      const shaped = rooms.map((r) => ({ ...r, visited }));
      const bottomLimit = 80; // HUD 上端 86px の手前に余白 6px
      const l = calcMapLayout(shaped, { mapBottom: bottomLimit });
      for (const r of shaped) {
        const { id, box } = partRects(r, l, false);
        const bottom = id ? id.y + id.h : box.y + box.h;
        expect(bottom, `visited=${visited} ${r.id} CELL=${l.CELL}`).toBeLessThanOrEqual(
          bottomLimit,
        );
      }
    }
  });

  it("mapBottom を省略した横持ちは従来どおり y=6〜106 の領域に収まる", () => {
    for (let i = 0; i < 50; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms.map((r) => ({ ...r, visited: true }));
        const l = calcMapLayout(rooms);
        for (const r of rooms) {
          const { id, box } = partRects(r, l, false);
          const bottom = id ? id.y + id.h : box.y + box.h;
          expect(bottom, `seed-${i} floor=${n} ${r.id}`).toBeLessThanOrEqual(
            MAP_AREA_TOP + MAP_AREA_H,
          );
        }
      }
    }
  });
});

describe("partCollisions: 部屋ID・記号・四角の重なり（#66）", () => {
  it("300 seed × 全階（全部屋に記号あり）で ID・記号が隣や下の部屋と重ならない", () => {
    for (let i = 0; i < 300; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms.map((r) => ({ ...r, visited: true }));
        for (const opts of [undefined, { availH: PORTRAIT_AVAIL_H }]) {
          const l = calcMapLayout(rooms, opts);
          expect(
            partCollisions(rooms, l, () => true),
            `seed-${i} floor=${n} CELL=${l.CELL} portrait=${!!opts}`,
          ).toEqual([]);
        }
        const layout = calcMapLayout(rooms);
        // 未踏の「?」が混じる場合（半分だけ訪問）
        const half = rooms.map((r, k) => ({ ...r, visited: k % 2 === 0 }));
        expect(
          partCollisions(half, layout, () => true),
          `seed-${i} floor=${n} half CELL=${layout.CELL}`,
        ).toEqual([]);
      }
    }
  });

  it("DENSE_SYM_W は 7px 送り幅（DotGothic16 の ◆▼♦▲★）より小さくならず、symbolFits と partRects が同じ値を使う", () => {
    expect(DENSE_SYM_W).toBeGreaterThanOrEqual(7 + 1);
    // 密な階（CELL=15, ROOM=9: 隙間6px）は実測幅7pxの記号が入らないので出さない
    const layout = at(15, 9);
    expect(layout.CELL - layout.ROOM).toBeLessThan(DENSE_SYM_W + 1);
    expect(symbolFits(layout)).toBe(false);
  });
});

/** WCAG 相対輝度によるコントラスト比。 */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const c = [1, 3, 5].map((i) => {
      const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("マップのコントラストと拡大（#89, minori 指定値）", () => {
  it("接続線・未踏枠は背景比 3:1 以上、訪問済み枠は 7:1 前後（非文字 3:1 は枠線で満たす）", () => {
    expect(contrast(MAP_SHAPE_COLORS.line, COLORS.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(MAP_SHAPE_COLORS.visitedEdge, COLORS.bg)).toBeGreaterThanOrEqual(7);
    // 塗りだけでは足りない（枠線が必要な理由）。指定値 1.86:1
    expect(contrast(MAP_SHAPE_COLORS.visitedFill, COLORS.bg)).toBeCloseTo(1.86, 1);
  });

  it("全階で CELL は 12〜24、行数 5 以下（6〜8部屋の階のほぼ全て）で CELL>=20", () => {
    for (let i = 0; i < 100; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms;
        const l = calcMapLayout(rooms);
        expect(l.CELL).toBeGreaterThanOrEqual(MIN_CELL);
        expect(l.CELL).toBeLessThanOrEqual(MAX_CELL);
        const rows = Math.max(...rooms.map((r) => r.y)) + 1;
        if (rows <= 5) expect(l.CELL, `seed-${i} floor=${n}`).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("横持ちは部屋の塊がマップ領域内で水平・垂直とも中央寄せ（上偏りなし）", () => {
    for (let i = 0; i < 100; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms;
        const l = calcMapLayout(rooms);
        const rects = rooms.map((r) => partRects({ ...r, visited: true }, l, false));
        const top = Math.min(...rects.map((p) => p.box.y));
        const bottom = Math.max(...rects.map((p) => (p.id ? p.id.y + p.id.h : p.box.y + p.box.h)));
        const left = Math.min(...rects.map((p) => p.box.x));
        const right = Math.max(...rects.map((p) => p.box.x + p.box.w));
        const msg = `seed-${i} floor=${n}`;
        expect(top, msg).toBeGreaterThanOrEqual(MAP_AREA_TOP);
        // 領域が足りない密な階（CELL=12 で行数が多い）は上端詰めでよい
        if (bottom <= MAP_AREA_TOP + MAP_AREA_H) {
          expect(
            Math.abs(top - MAP_AREA_TOP - (MAP_AREA_TOP + MAP_AREA_H - bottom)),
            msg,
          ).toBeLessThanOrEqual(1);
        }
        expect(Math.abs(left - (320 - right)), msg).toBeLessThanOrEqual(1);
      }
    }
  });
});
