import { describe, expect, it } from "vitest";
import { Grid, opposite, rotateCW, step } from "../../src/core/grid";

describe("Grid", () => {
  it("get/set と範囲外の例外", () => {
    const g = new Grid(3, 2, 0);
    g.set({ x: 2, y: 1 }, 7);
    expect(g.get({ x: 2, y: 1 })).toBe(7);
    expect(() => g.get({ x: 3, y: 0 })).toThrow(RangeError);
  });

  it("neighbors は N,E,S,W の固定順で盤内のみ", () => {
    const g = new Grid(3, 3, 0);
    expect(g.neighbors({ x: 0, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
    expect(g.neighbors({ x: 1, y: 1 })).toHaveLength(4);
  });

  it("entries は行優先の固定順", () => {
    const g = new Grid(2, 2, (p) => `${p.x},${p.y}`);
    expect([...g.entries()].map(([, v]) => v)).toEqual(["0,0", "1,0", "0,1", "1,1"]);
  });

  it("JSON 往復", () => {
    const g = new Grid(2, 2, (p) => p.x + p.y);
    expect(Grid.fromJSON(g.toJSON()).toJSON()).toEqual(g.toJSON());
  });

  it("方向ユーティリティ", () => {
    expect(rotateCW("W")).toBe("N");
    expect(opposite("E")).toBe("W");
    expect(step({ x: 1, y: 1 }, "N")).toEqual({ x: 1, y: 0 });
  });
});
