import { describe, expect, it } from "vitest";
import {
  CHAR_W,
  MIN_NAME_CHARS,
  calcMapLayout,
  labelCollisions,
  labelRect,
  mapLabelText,
  shortLabel,
} from "../../src/scenes/map-symbols";
import { floorCount, generateFloor } from "../../src/core/floor";
import type { RoomState } from "../../src/core/run";

function room(id: string, label: string, x: number, y: number, visited = false): RoomState {
  return {
    id,
    label,
    x,
    y,
    neighbors: [],
    visited,
    content: { kind: "empty" },
  };
}

// ---- shortLabel ----

describe("shortLabel: ラベルを8文字に短縮する", () => {
  it("9文字は7文字+…", () => {
    expect(shortLabel("scheduler")).toBe("schedul\u2026"); // 9文字
  });

  it("12文字は7文字+…", () => {
    expect(shortLabel("scheduler.tick()")).toBe("schedul\u2026");
  });

  it("ちょうど8文字はそのまま", () => {
    expect(shortLabel("queue.pu")).toBe("queue.pu");
  });

  it("1文字はそのまま", () => {
    expect(shortLabel("r")).toBe("r");
  });

  it("空文字列はそのまま", () => {
    expect(shortLabel("")).toBe("");
  });
});

// ---- ラベルの重なり（本番のレイアウトで） ----

const at = (CELL: number, ROOM = Math.floor((CELL * 20) / 32)) => ({
  CELL,
  ROOM,
  ORIGIN_X: 20,
  ORIGIN_Y: 20,
});

describe("mapLabelText: 1マスに収まる名前だけ出す", () => {
  it("未踏は ?", () => {
    expect(mapLabelText(room("r1", "scheduler.tick()", 0, 0), 15)).toBe("?");
  });
  it("CELL=20 は4文字まで（scheduler.tick() → sch…）", () => {
    expect(mapLabelText(room("r1", "scheduler.tick()", 0, 0, true), 20)).toBe("sch\u2026");
  });
  it(`CELL=15 は ${Math.floor(15 / CHAR_W)} 文字しか入らないので名前を出さない（< ${MIN_NAME_CHARS}）`, () => {
    expect(mapLabelText(room("r1", "scheduler.tick()", 0, 0, true), 15)).toBeNull();
    expect(labelRect(room("r1", "scheduler.tick()", 0, 0, true), at(15))).toBeNull();
  });
});

describe("labelCollisions: 描く文字列の幅で重なりを見る", () => {
  it("横に隣り合う部屋: 幅は CELL 固定ではなく描く文字列の長さ", () => {
    const a = room("r0", "scheduler.tick()", 0, 0, true);
    expect(labelRect(a, at(30))?.w).toBe(6 * CHAR_W); // "sched…"
    expect(labelRect(room("r1", "?", 0, 0), at(30))?.w).toBe(CHAR_W);
  });

  it("同じマスに2部屋（あり得ないが）なら重なりを検出する", () => {
    const rooms = [room("r0", "auth.login()", 0, 0, true), room("r1", "db.query()", 0, 0, true)];
    expect(labelCollisions(rooms, at(32))).toEqual([["r0", "r1"]]);
  });

  it("本番の calcMapLayout で 300 seed × 全階・全部屋訪問済み（最悪ケース）でも名前が重ならない", () => {
    const cells = new Set<number>();
    for (let i = 0; i < 300; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const seed = `seed-${i}`;
        const rooms = generateFloor(seed, n).rooms.map((r) => ({ ...r, visited: true }));
        const layout = calcMapLayout(rooms);
        cells.add(layout.CELL);
        expect(
          labelCollisions(rooms, layout),
          `seed=${seed} floor=${n} CELL=${layout.CELL}`,
        ).toEqual([]);
        // 未踏の「?」が混じる場合（半分だけ訪問）
        const half = rooms.map((r, k) => ({ ...r, visited: k % 2 === 0 }));
        expect(labelCollisions(half, layout), `seed=${seed} floor=${n} half`).toEqual([]);
      }
    }
    // 密な階（CELL<20）も除外せずに回っていること
    expect([...cells].some((c) => c < 20)).toBe(true);
  });
});
