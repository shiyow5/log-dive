import { describe, expect, it } from "vitest";
import {
  DENSE_SYM_W,
  CHAR_W,
  ID_FONT_PX,
  PORTRAIT_AVAIL_H,
  UNKNOWN_H,
  UNKNOWN_W,
  calcMapLayout,
  partCollisions,
  partRects,
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
    // seed-2 の2階（CELL=15, ROOM=9: 隙間6px）は実測幅7pxの記号が入らないので出さない
    const rooms = generateFloor("seed-2", 2).rooms.map((r) => ({ ...r, visited: true }));
    const layout = calcMapLayout(rooms);
    expect(layout.CELL - layout.ROOM).toBeLessThan(DENSE_SYM_W + 1);
    expect(symbolFits(layout)).toBe(false);
  });
});
