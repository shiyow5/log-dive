import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/rng";

describe("Rng", () => {
  it("同じシードなら同じ列になる", () => {
    const a = new Rng("seed-1");
    const b = new Rng("seed-1");
    const xs = Array.from({ length: 50 }, () => a.nextU32());
    const ys = Array.from({ length: 50 }, () => b.nextU32());
    expect(xs).toEqual(ys);
  });

  it("違うシードなら違う列になる", () => {
    expect(new Rng("a").nextU32()).not.toBe(new Rng("b").nextU32());
  });

  it("state から再開すると続きが一致する", () => {
    const a = new Rng(42);
    a.next();
    a.next();
    const resumed = new Rng(a.state);
    expect(resumed.next()).toBe(a.next());
  });

  it("int は両端を含む範囲に収まる", () => {
    const r = new Rng("range");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it("不正な範囲は例外", () => {
    expect(() => new Rng(1).int(3, 1)).toThrow(RangeError);
  });

  it("shuffle は元の配列を変えず、要素は同じ", () => {
    const src = [1, 2, 3, 4, 5];
    const out = new Rng("s").shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual(src);
  });

  it("既知の値に固定（実装を変えるとリプレイが壊れることを検出する）", () => {
    const r = new Rng("golden");
    expect(Array.from({ length: 3 }, () => r.nextU32())).toMatchSnapshot();
  });
});
