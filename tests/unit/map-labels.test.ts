import { describe, expect, it } from "vitest";
import {
  DENSE_SYM_W,
  ID_FONT_PX,
  UNKNOWN_H,
  UNKNOWN_OFFSET,
  UNKNOWN_W,
  calcMapLayout,
  partCollisions,
  partRects,
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

  it("未踏「?」は 6×8px、箱の右上角から (+2, -2) で、箱の上辺・右辺の接続線（辺の中央）と交わらない", () => {
    expect([UNKNOWN_W, UNKNOWN_H]).toEqual([6, 8]);
    expect(UNKNOWN_OFFSET).toEqual({ x: 2, y: -2 });
    for (const CELL of [20, 30]) {
      const layout = at(CELL);
      const r = room("r1", 2, 2);
      const { box, unknown } = partRects(r, layout, false);
      expect(unknown).not.toBeNull();
      const u = unknown!;
      expect(u.x).toBe(box.x + box.w + 2);
      expect(u.y + u.h).toBe(box.y - 2);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      // 接続線: 上へ x=cx（y<box.top）、右へ y=cy（x>box.right）。「?」はどちらの線上にもない
      expect(u.x > cx || u.x + u.w < cx).toBe(true);
      expect(u.y + u.h <= box.y).toBe(true);
      expect(u.y + u.h < cy).toBe(true);
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

  it("疎な階の ID は箱の外左下（箱の下辺より下・箱の左端始まり）", () => {
    const layout = at(30);
    const { box, id } = partRects(room("r3", 1, 1, true), layout, false);
    expect(id.x).toBe(box.x);
    expect(id.y).toBe(box.y + box.h);
  });
});

describe("partCollisions: 部屋ID・記号・四角の重なり（#66）", () => {
  it("300 seed × 全階（全部屋に記号あり）で ID・記号が隣や下の部屋と重ならない", () => {
    for (let i = 0; i < 300; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms.map((r) => ({ ...r, visited: true }));
        const layout = calcMapLayout(rooms);
        expect(
          partCollisions(rooms, layout, () => true),
          `seed-${i} floor=${n} CELL=${layout.CELL}`,
        ).toEqual([]);
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
