import { describe, expect, it } from "vitest";
import { loadGameData } from "../../src/core/data";
import { MemoryStorage } from "../../src/core/save";
import { apply, initRun, legalActions, type Action, type RunState } from "../../src/core/run";
import {
  BATTLE_TUTORIAL_COMPLETE_KEY,
  BATTLE_TUTORIAL_SKIPPED_KEY,
  BattleTutorial,
  TIMEOUT_TURNS,
  shouldShowBattleTutorial,
} from "../../src/scenes/battle-tutorial";
import { parseFlags } from "../../src/ui/flags";
import { TUTORIAL_KEY } from "../../src/ui/map-tutorial";

const data = loadGameData();

/** 戦闘状態の最小の見本（必要な項目だけ上書きする）。 */
const battle = (
  over: { reproduced?: boolean; floor?: number; turns?: number; candidates?: number } = {},
): RunState => {
  const base = initRun("s") as RunState;
  return {
    ...base,
    stats: { ...base.stats, turns: over.turns ?? 0 },
    phase: "battle",
    floor: { ...base.floor, number: over.floor ?? 1 },
    battle: {
      reproduced: over.reproduced ?? false,
      candidates: Array.from({ length: over.candidates ?? 3 }, (_, i) => `bug${i}`),
    } as unknown as RunState["battle"],
  };
};
const map = (): RunState => ({ ...(initRun("s") as RunState), phase: "map", battle: null });
const mk = (st = new MemoryStorage(), qaSeed = false, force = false) =>
  [new BattleTutorial(st, { qaSeed, force }), st] as const;
const has = (st: MemoryStorage, key: string) => st.getItem(key) !== null;

describe("BattleTutorial (#59)", () => {
  it("保存キーは完了とスキップで別、マップ側 tutorial.map とも別", () => {
    expect(BATTLE_TUTORIAL_COMPLETE_KEY).toBe("tutorial.battle_complete");
    expect(BATTLE_TUTORIAL_SKIPPED_KEY).toBe("tutorial.battle_skipped");
    const keys = [BATTLE_TUTORIAL_COMPLETE_KEY, BATTLE_TUTORIAL_SKIPPED_KEY, TUTORIAL_KEY];
    expect(new Set(keys).size).toBe(3);
  });

  it("初回・1階・戦闘中なら ① 再現 から始まる", () => {
    const [t] = mk();
    t.start(battle());
    expect(t.view()).toMatchObject({ step: 1, target: "reproduce" });
  });

  it("① → ② → ③ と進み、戦闘が終わると完了が保存される", () => {
    const [t, st] = mk();
    t.start(battle());
    t.observe(battle({ reproduced: true }));
    expect(t.view()).toMatchObject({ step: 2, target: "read-log" });
    t.observe(battle({ reproduced: true, candidates: 2 }));
    expect(t.view()).toMatchObject({ step: 3, target: "patch" });
    t.observe(battle({ reproduced: true, candidates: 2 }));
    expect(t.active).toBe(true);
    t.observe(map());
    expect(t.active).toBe(false);
    expect(has(st, BATTLE_TUTORIAL_COMPLETE_KEY)).toBe(true);
    expect(has(st, BATTLE_TUTORIAL_SKIPPED_KEY)).toBe(false);
  });

  it("③ でパッチが CPU 不足なら「ターン終了」、未再現なら「再現手順」へ案内を切り替える（段は進まない）", () => {
    const [t] = mk();
    t.start(battle({ candidates: 1, reproduced: true }));
    expect(t.view()?.target).toBe("patch");
    expect(t.view("cpu")).toMatchObject({ step: 3, target: "endTurn" });
    expect(t.view("cpu")?.text).toContain("ターン終了");
    expect(t.view("reproduce")).toMatchObject({ step: 3, target: "reproduce" });
    expect(t.view()?.step).toBe(3);
  });

  it("案内以外の操作（ターン経過なし・候補変化なし）では案内は消えず、段も進まない", () => {
    const [t, st] = mk();
    t.start(battle());
    for (let i = 0; i < 5; i++) {
      t.observe(battle({ turns: 0 }));
      expect(t.view()?.step).toBe(1);
    }
    expect(has(st, BATTLE_TUTORIAL_COMPLETE_KEY)).toBe(false);
  });

  it("候補が最初から1つなら ② を飛ばす。再現と同時に候補が減っても2段進める", () => {
    const [t] = mk();
    t.start(battle({ candidates: 1 }));
    t.observe(battle({ reproduced: true, candidates: 1 }));
    expect(t.view()?.step).toBe(3);
  });

  it("① ② は TIMEOUT_TURNS ターンで次へ進み、③ はターンが進んでも終わらない", () => {
    const [t, st] = mk();
    t.start(battle({ turns: 2 }));
    t.start(battle({ turns: 3 })); // 再入室でも開始値は保持
    t.observe(battle({ turns: 2 + TIMEOUT_TURNS - 1 }));
    expect(t.view()?.step).toBe(1);
    t.observe(battle({ turns: 2 + TIMEOUT_TURNS }));
    expect(t.view()?.step).toBe(2);
    t.observe(battle({ turns: 2 + TIMEOUT_TURNS * 2 }));
    expect(t.view()?.step).toBe(3);
    t.observe(battle({ turns: 2 + TIMEOUT_TURNS * 10 }));
    expect(t.view()?.step).toBe(3);
    expect(has(st, BATTLE_TUTORIAL_COMPLETE_KEY)).toBe(false);
  });

  it("スキップはどの段でも効き、skipped だけが保存される。2回目は出ない", () => {
    for (const reproduced of [false, true]) {
      const [t, st] = mk();
      t.start(battle());
      if (reproduced) t.observe(battle({ reproduced }));
      t.skip();
      expect(t.active).toBe(false);
      expect(has(st, BATTLE_TUTORIAL_SKIPPED_KEY)).toBe(true);
      expect(has(st, BATTLE_TUTORIAL_COMPLETE_KEY)).toBe(false);
      expect(shouldShowBattleTutorial(st)).toBe(false);
      const [t2] = mk(st);
      t2.start(battle());
      expect(t2.active).toBe(false);
    }
  });

  it("完了後の2回目は出ない。PR-1 の旧キーが残っていても出ない", () => {
    const [t, st] = mk();
    t.start(battle());
    t.observe(map());
    const [t2] = mk(st);
    t2.start(battle());
    expect(t2.active).toBe(false);
    const old = new MemoryStorage();
    old.setItem("tutorial.battle", JSON.stringify({ v: 1, data: "done" }));
    expect(shouldShowBattleTutorial(old)).toBe(false);
  });

  it("再入室では続きから（再開始しない）", () => {
    const [t] = mk();
    t.start(battle());
    t.observe(battle({ reproduced: true }));
    t.start(battle({ reproduced: true }));
    expect(t.view()?.step).toBe(2);
  });

  it("2階以降・戦闘外では出ない", () => {
    for (const s of [battle({ floor: 2 }), map()]) {
      const [t] = mk();
      t.start(s);
      expect(t.active).toBe(false);
    }
  });

  it("?seed=（QA）では出ず、フラグも書かない", () => {
    const [t, st] = mk(new MemoryStorage(), true);
    t.start(battle());
    expect(t.active).toBe(false);
    t.skip();
    expect(has(st, BATTLE_TUTORIAL_SKIPPED_KEY)).toBe(false);
  });

  it("?seed=&tutorial=battle（強制）では保存済みでも出て、フラグは書かず、同じ読み込み中は1回だけ", () => {
    const [t0, st] = mk();
    t0.start(battle());
    t0.skip();
    const [t] = mk(st, true, true);
    t.start(battle());
    expect(t.view()?.step).toBe(1);
    t.observe(map());
    expect(has(st, BATTLE_TUTORIAL_COMPLETE_KEY)).toBe(false);
    t.start(battle());
    expect(t.active).toBe(false);
  });

  it("壊れた保存値・読めないストレージでは出さない", () => {
    const bad = new MemoryStorage();
    bad.setItem(BATTLE_TUTORIAL_COMPLETE_KEY, "{broken");
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

describe("?tutorial=battle フラグ", () => {
  it("tutorial=battle のときだけ true。他の値・無指定は false", () => {
    expect(parseFlags("?seed=1&tutorial=battle").tutorialBattle).toBe(true);
    for (const q of ["", "?tutorial=map", "?tutorial=", "?tutorial=BATTLE", "?seed=1"])
      expect(parseFlags(q).tutorialBattle).toBe(false);
  });
});

describe("シード固定・不正シードでも壊れない（enishi 補足）", () => {
  /** 1階を歩いて最初に戦闘になるところまで進める（未訪問の部屋を優先）。 */
  function firstBattle(seed: string): RunState {
    let s = initRun(seed, data);
    const seen = new Set<string>([s.roomId]);
    for (let i = 0; i < 60 && s.phase !== "battle"; i++) {
      const moves = legalActions(s, data).filter(
        (a): a is Extract<Action, { t: "move" }> => a.t === "move",
      );
      const mv = moves.find((m) => !seen.has(m.room)) ?? moves[i % Math.max(moves.length, 1)];
      if (!mv) break;
      seen.add(mv.room);
      s = apply(s, mv, data);
    }
    return s;
  }
  const play = (s: RunState, t: BattleTutorial): RunState => {
    for (const id of ["reproduce", "read-log"] as const) {
      const a: Action = { t: "skill", id };
      if (legalActions(s, data).some((l) => l.t === "skill" && l.id === id)) s = apply(s, a, data);
      t.observe(s);
    }
    return s;
  };
  const seeds = ["e2e-7", "abc", "", "-1", "1e999", "9".repeat(400), "日本語🙂", "__proto__"];

  it.each(seeds)("seed=%j: 強制表示で ①→③ まで進み、例外を出さない", (seed) => {
    const s0 = firstBattle(seed);
    expect(s0.phase).toBe("battle");
    const t = new BattleTutorial(new MemoryStorage(), { qaSeed: true, force: true });
    t.start(s0);
    expect(t.view()?.step).toBe(1);
    const s1 = play(s0, t);
    expect(t.view()?.step).toBe(3);
    expect(s1.phase).toBe("battle");
  });

  it("同じ seed なら同じ手順（各段の遷移列が一致する）", () => {
    const trace = () => {
      const t = new BattleTutorial(new MemoryStorage(), { qaSeed: true, force: true });
      let s = firstBattle("e2e-7");
      t.start(s);
      const steps = [t.view()?.step];
      for (const id of ["reproduce", "read-log"] as const) {
        if (legalActions(s, data).some((l) => l.t === "skill" && l.id === id))
          s = apply(s, { t: "skill", id }, data);
        t.observe(s);
        steps.push(t.view()?.step);
      }
      return steps;
    };
    expect(trace()).toEqual(trace());
  });

  it("?seed= だけ（強制なし）では、どの seed でも案内は出ない", () => {
    for (const seed of seeds) {
      const t = new BattleTutorial(new MemoryStorage(), { qaSeed: true });
      t.start(firstBattle(seed));
      expect(t.active).toBe(false);
    }
  });
});
