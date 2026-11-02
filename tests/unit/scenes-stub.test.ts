import { describe, expect, it } from "vitest";
import { apply, createRun } from "../../src/scenes/stub/run-stub";
import { sceneFor } from "../../src/scenes/run-port";
import { parseFlags } from "../../src/ui/flags";

describe("parseFlags", () => {
  it("?fx=0 で演出オフ、それ以外はオン", () => {
    expect(parseFlags("?fx=0").fx).toBe(false);
    expect(parseFlags("").fx).toBe(true);
    expect(parseFlags("?fx=1").fx).toBe(true);
  });
  it("?seed= を読む", () => {
    expect(parseFlags("?seed=abc&fx=0").seed).toBe("abc");
    expect(parseFlags("").seed).toBeNull();
  });
});

describe("画面用スタブ（K3 で core に差し替え）", () => {
  it("移動→再現→パッチで撃破し、リザルトへ", () => {
    let s = createRun("t");
    expect(sceneFor(s)).toBe("map");
    s = apply(s, { t: "move", room: 1 });
    expect(sceneFor(s)).toBe("battle");
    s = apply(s, { t: "skill", id: "reproduce" });
    expect(s.battle?.symptoms).toHaveLength(1);
    s = apply(s, { t: "skill", id: "patch", arg: "off-by-one" });
    expect(s.status).toBe("won");
    expect(s.closedBugs).toBe(1);
    expect(sceneFor(s)).toBe("result");
  });

  it("不正な操作は lastError だけ立てて CPU を使わない", () => {
    let s = apply(createRun("t"), { t: "move", room: 1 });
    const before = s.cpu;
    s = apply(s, { t: "skill", id: "patch", arg: "off-by-one" });
    expect(s.lastError).toMatch(/再現/);
    expect(s.cpu).toBe(before);
    s = apply(s, { t: "move", room: 0 });
    expect(s.lastError).toMatch(/戦闘中/);
  });

  it("外したパッチはデグレ（バグ回復）", () => {
    let s = apply(createRun("t"), { t: "move", room: 1 });
    s = apply(s, { t: "skill", id: "hotfix" });
    expect(s.battle?.hp).toBe(12);
    s = apply(s, { t: "endTurn" });
    s = apply(s, { t: "skill", id: "reproduce" });
    s = apply(s, { t: "skill", id: "patch", arg: "null-ref" });
    expect(s.degrades).toBe(1);
    expect(s.battle?.hp).toBe(15);
  });

  it("abandon でリザルトへ", () => {
    const s = apply(createRun("t"), { t: "abandon" });
    expect(sceneFor(s)).toBe("result");
  });
});
