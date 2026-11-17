import { describe, expect, it } from "vitest";
import { MemoryStorage, SaveStore } from "../../src/core/save";
import { initRun, type RunState } from "../../src/core/run";
import {
  BATTLE_TUTORIAL_KEY,
  BattleTutorial,
  TIMEOUT_TURNS,
  shouldShowBattleTutorial,
} from "../../src/scenes/battle-tutorial";
import { TUTORIAL_KEY } from "../../src/ui/map-tutorial";

const battle = (over: { reproduced?: boolean; floor?: number } = {}): RunState => {
  const base = initRun("s") as RunState;
  return {
    ...base,
    phase: "battle",
    floor: { ...base.floor, number: over.floor ?? 1 },
    battle: { reproduced: over.reproduced ?? false } as RunState["battle"],
  };
};
const map = (): RunState => ({ ...(initRun("s") as RunState), phase: "map", battle: null });
const saved = (st: MemoryStorage) => new SaveStore<string>(st, BATTLE_TUTORIAL_KEY, 1).load();

describe("BattleTutorial (#59 PR-1)", () => {
  it("保存キーは tutorial.battle で、マップ側 tutorial.map とは別", () => {
    expect(BATTLE_TUTORIAL_KEY).toBe("tutorial.battle");
    expect(BATTLE_TUTORIAL_KEY).not.toBe(TUTORIAL_KEY);
  });

  it("初回・1階・戦闘中なら始まる", () => {
    const t = new BattleTutorial(new MemoryStorage(), false);
    t.start(battle());
    expect(t.active).toBe(true);
  });

  it("?seed=（QA）では出ず、フラグも書かない", () => {
    const st = new MemoryStorage();
    const t = new BattleTutorial(st, true);
    t.start(battle());
    expect(t.active).toBe(false);
    t.skip();
    expect(saved(st).ok).toBe(false);
  });

  it("2階以降・戦闘外・再現済みでは出ない", () => {
    for (const s of [battle({ floor: 2 }), map(), battle({ reproduced: true })]) {
      const t = new BattleTutorial(new MemoryStorage(), false);
      t.start(s);
      expect(t.active).toBe(false);
    }
  });

  it("Reproduce を押すと終わり、保存して2回目は出ない", () => {
    const st = new MemoryStorage();
    const t = new BattleTutorial(st, false);
    t.start(battle());
    t.observe(battle({ reproduced: true }));
    expect(t.active).toBe(false);
    expect(saved(st).ok).toBe(true);
    expect(shouldShowBattleTutorial(st)).toBe(false);
    const t2 = new BattleTutorial(st, false);
    t2.start(battle());
    expect(t2.active).toBe(false);
  });

  it("ほかのボタンを押しても消えず、TIMEOUT_TURNS で自動終了", () => {
    const t = new BattleTutorial(new MemoryStorage(), false);
    t.start(battle());
    for (let i = 1; i < TIMEOUT_TURNS; i++) {
      t.observe(battle());
      expect(t.active).toBe(true);
    }
    t.observe(battle());
    expect(t.active).toBe(false);
  });

  it("スキップで終わり保存される。再入室で続きから（再開始しない）", () => {
    const st = new MemoryStorage();
    const t = new BattleTutorial(st, false);
    t.start(battle());
    t.start(battle());
    expect(t.active).toBe(true);
    t.skip();
    expect(t.active).toBe(false);
    expect(saved(st).ok).toBe(true);
  });

  it("壊れた保存値・読めないストレージでは出さない", () => {
    const bad = new MemoryStorage();
    bad.setItem(BATTLE_TUTORIAL_KEY, "{broken");
    expect(shouldShowBattleTutorial(bad)).toBe(false);
    expect(
      shouldShowBattleTutorial({
        getItem: () => {
          throw new Error("x");
        },
        setItem: () => {},
        removeItem: () => {},
      }),
    ).toBe(false);
  });
});
