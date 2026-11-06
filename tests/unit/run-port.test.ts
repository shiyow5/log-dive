import { describe, expect, it } from "vitest";
import {
  bugName,
  current,
  describeEvents,
  dispatch,
  lastLogLine,
  legality,
  sceneFor,
  skillInfo,
  startRun,
} from "../../src/scenes/run-port";
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

describe("run-port（画面 ↔ core/run.ts）", () => {
  it("r0→r1 移動→reproduce→patch(off-by-one) で撃破し、マップに戻る", () => {
    let s = startRun("t-123");
    expect(sceneFor(s)).toBe("map");
    expect(s.roomId).toBe("r0");
    expect(legality(s).can({ t: "move", room: "r1" })).toBe(true);
    s = dispatch({ t: "move", room: "r1" });
    expect(sceneFor(s)).toBe("battle");
    s = dispatch({ t: "skill", id: "reproduce" });
    expect(s.battle?.symptoms).toHaveLength(1);
    expect(lastLogLine()).toMatch(/^再現した。症状「/);
    s = dispatch({ t: "skill", id: "patch", arg: "off-by-one" });
    expect(s.phase).toBe("won");
    expect(s.stats.bugsClosed).toBe(1);
    expect(sceneFor(s)).toBe("result");
    expect(lastLogLine()).toContain("バグ票を閉じた");
  });

  it("ボタンの可否は legalActions、理由は lastError.message（未再現は CPU より先）", () => {
    startRun("t-123");
    dispatch({ t: "move", room: "r1" });
    dispatch({ t: "skill", id: "hotfix" });
    dispatch({ t: "skill", id: "hotfix" });
    // CPU 1 残り・未再現: patch は not_reproduced の理由が出る
    const s = current();
    expect(s.player.cpu).toBe(1);
    const patch = { t: "skill", id: "patch", arg: "off-by-one" } as const;
    expect(legality(s).can(patch)).toBe(false);
    expect(legality(s).why(patch)).toBe("再現できていないバグは直せません");
    expect(legality(s).can({ t: "skill", id: "reproduce" })).toBe(true);
    expect(legality(s).can({ t: "move", room: "r0" })).toBe(false);
  });

  it("不正な操作は lastError を立て、状態（CPU）は変えない", () => {
    startRun("t-123");
    let s = dispatch({ t: "move", room: "r1" });
    const cpu = s.player.cpu;
    s = dispatch({ t: "skill", id: "patch", arg: "off-by-one" });
    expect(s.lastError?.code).toBe("not_reproduced");
    expect(s.player.cpu).toBe(cpu);
    expect(lastLogLine()).toBeNull();
    s = dispatch({ t: "move", room: "r0" });
    expect(s.lastError?.message).toBe("戦闘中は移動できません");
  });

  it("隣でない部屋には移動できない（r0 から r2）", () => {
    const s = startRun("t-123");
    expect(legality(s).can({ t: "move", room: "r2" })).toBe(false);
    expect(legality(s).why({ t: "move", room: "r2" })).toBe("隣の部屋ではありません");
  });

  it("abandon でリザルトへ", () => {
    startRun("t-123");
    const s = dispatch({ t: "abandon" });
    expect(s.phase).toBe("abandoned");
    expect(sceneFor(s)).toBe("result");
  });

  it("名前は data/*.json から引く", () => {
    expect(bugName("off-by-one")).toBe("境界ずれ");
    expect(skillInfo("patch")).toEqual({ name: "修正パッチ", cpu: 2 });
  });

  it("describeEvents: イベントが無ければ null", () => {
    expect(describeEvents(startRun("t-123"), [])).toBeNull();
  });
});
