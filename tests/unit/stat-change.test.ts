import { describe, expect, it } from "vitest";
import { createChangeTracker } from "../../src/scenes/stat-change";

describe("createChangeTracker（#195 値が前回描画から変わったか）", () => {
  it("初回は変化なし", () => expect(createChangeTracker()(10, [])).toBe(false));
  it("減少も増加も変化として拾う", () => {
    const c = createChangeTracker();
    c(10, []);
    expect(c(7, [])).toBe(true);
    expect(c(9, [])).toBe(true);
  });
  it("値が同じなら変化なし", () => {
    const c = createChangeTracker();
    c(10, []);
    expect(c(10, [])).toBe(false);
  });
  it("同じ events での描き直しは前回の判定を保つ（太字がちらつかない）", () => {
    const c = createChangeTracker();
    const ev = [{ t: "playerDamaged" }];
    c(10, []);
    expect(c(7, ev)).toBe(true);
    expect(c(7, ev)).toBe(true);
    expect(c(7, [])).toBe(false);
  });
});
