import { describe, expect, it } from "vitest";
import { recommend } from "../../src/scenes/battle-hint";

describe("recommend（#93 推奨ボタン）", () => {
  it("未再現で再現できる→再現する", () => expect(recommend(false, true, false)).toBe("reproduce"));
  it("再現済みでパッチできる→修正パッチ", () => expect(recommend(true, true, true)).toBe("patch"));
  it("CPU不足で押せない→ターン終了", () => {
    expect(recommend(false, false, false)).toBe("endTurn");
    expect(recommend(true, false, false)).toBe("endTurn");
  });
});
