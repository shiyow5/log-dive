import { describe, expect, it } from "vitest";
import { ReplayRecorder, runReplay, type Reducer } from "../../src/core/replay";
import { Rng } from "../../src/core/rng";

interface S {
  rng: Rng;
  total: number;
}
const reducer: Reducer<S, "roll"> = {
  init: (seed) => ({ rng: new Rng(seed), total: 0 }),
  apply: (s, _a) => ({ rng: s.rng, total: s.total + s.rng.int(1, 6) }),
};

describe("replay", () => {
  it("シード＋入力列で同じ結果を再生できる", () => {
    const rec = new ReplayRecorder<"roll">("test", 1, "r-1");
    let live = reducer.init("r-1");
    for (let i = 0; i < 10; i++) {
      rec.record("roll");
      live = reducer.apply(live, "roll");
    }
    expect(runReplay(reducer, rec.toReplay()).total).toBe(live.total);
  });
});
