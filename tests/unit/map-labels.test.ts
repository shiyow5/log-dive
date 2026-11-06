import { describe, expect, it } from "vitest";
import { checkLabelCollision, shortLabel } from "../../src/scenes/map-symbols";
import { generateFloor, loadFloors } from "../../src/core/floor";
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

// ---- checkLabelCollision ----

describe("checkLabelCollision: ラベル矩形の重なりを検査する", () => {
  it("離れた部屋は重ならない", () => {
    const rooms = [room("r0", "auth.login()", 0, 0), room("r1", "cache.get()", 5, 5)];
    const CELL = 32;
    const ROOM = 20;
    expect(checkLabelCollision(rooms, CELL, ROOM, 96, 20)).toBe(false);
  });

  it("隣接部屋は短縮しても重ならない（CELL=32）", () => {
    const rooms = [room("r0", "scheduler.tick()", 0, 0), room("r1", "main.run()", 1, 0)];
    expect(checkLabelCollision(rooms, 32, 20, 96, 20)).toBe(false);
  });

  it("同じマスの部屋（あり得ないが）は重なる", () => {
    const rooms = [room("r0", "auth.login()", 0, 0), room("r1", "db.query()", 0, 0)];
    expect(checkLabelCollision(rooms, 32, 20, 96, 20)).toBe(true);
  });

  it("4シード×全階の実データで重ならないことを確認（CELL=32）", () => {
    const seeds = ["seed-0", "seed-1", "seed-2", "seed-3"];
    const floors = loadFloors();
    const nFloors = floors.floors.length;
    for (const seed of seeds) {
      for (let n = 1; n <= nFloors; n++) {
        const floor = generateFloor(seed, n);
        const rooms = floor.rooms;
        const CELL = 32;
        const ROOM = 20;
        // 実際のグリッド原点: mapW/mapH を使って計算
        const maxX = Math.max(...rooms.map((r) => r.x));
        const maxY = Math.max(...rooms.map((r) => r.y));
        const mapW = maxX + 1;
        const ORIGIN_X = Math.floor((320 - mapW * CELL) / 2);
        const ORIGIN_Y = 20;
        const ctx = `seed=${seed} floor=${n}`;
        expect(checkLabelCollision(rooms, CELL, ROOM, ORIGIN_X, ORIGIN_Y), ctx).toBe(false);
      }
    }
  });
});
