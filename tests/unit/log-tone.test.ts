import { describe, expect, it } from "vitest";
import { logTone } from "../../src/scenes/log-tone";

const ev = (...ts: string[]) => ts.map((t) => ({ t })) as Parameters<typeof logTone>[0];

describe("logTone（#116 優先順 damage > clear > progress）", () => {
  it("イベントなし・無関係は null", () => {
    expect(logTone([])).toBeNull();
    expect(logTone(ev("battleStart"))).toBeNull();
  });
  it("progress 系（stairsOpened / descended / looted）", () => {
    expect(logTone(ev("stairsOpened"))).toBe("progress");
    expect(logTone(ev("descended"))).toBe("progress");
    expect(logTone(ev("looted"))).toBe("progress");
  });
  it("bugClosed は clear", () => expect(logTone(ev("bugClosed"))).toBe("clear"));
  it("clear は progress より優先", () =>
    expect(logTone(ev("looted", "bugClosed", "stairsOpened"))).toBe("clear"));
  it("damage は clear・progress より優先（並び順に依らない）", () => {
    expect(logTone(ev("bugClosed", "playerDamaged"))).toBe("damage");
    expect(logTone(ev("playerDamaged", "bugClosed", "descended"))).toBe("damage");
  });
});
