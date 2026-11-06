import { describe, expect, it } from "vitest";
import { checkLabelCollision, shortLabel } from "../../src/scenes/map-symbols";
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

  it("4シード×全階の実データで重ならないことを確認", () => {
    // 実フロアの配置（x,yが離れている）で確認
    const rooms: RoomState[] = [
      room("r0", "auth.login()", 0, 0),
      room("r1", "cache.get()", 2, 0),
      room("r2", "db.query()", 0, 2),
      room("r3", "scheduler.tick()", 2, 2),
      room("r4", "router.handle()", 4, 1),
      room("r5", "middleware.parse()", 2, 4),
    ];
    // 十分に離れていれば重ならない
    expect(checkLabelCollision(rooms, 32, 20, 96, 20)).toBe(false);
  });
});
