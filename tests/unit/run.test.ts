import { describe, expect, it } from "vitest";
import { initFixedRun } from "./fixed-run";
import { loadGameData } from "../../src/core/data";
import { generateFloor } from "../../src/core/floor";
import { randInt, randPick, randShuffle } from "../../src/core/rand";
import { runReplay } from "../../src/core/replay";
import { seedFrom } from "../../src/core/rng";
import {
  RULES_VERSION,
  apply,
  initRun,
  stairsOpen,
  legalActions,
  runReducer,
  type Action,
  type RunState,
} from "../../src/core/run";

const data = loadGameData();

function play(seed: string, actions: readonly Action[]): RunState {
  return actions.reduce((s, a) => apply(s, a), initFixedRun(seed));
}

function bugHere(seed: string): RunState {
  return play(seed, [{ t: "move", room: "r1" }]);
}

describe("rand: 値と次の状態を返す純粋関数", () => {
  it("同じ状態から同じ値、入力の状態は変えない", () => {
    const s = seedFrom("x");
    const before = { ...s };
    const [a, s1] = randInt(s, 1, 6);
    const [b, s2] = randInt(s, 1, 6);
    expect(a).toBe(b);
    expect(s1).toEqual(s2);
    expect(s).toEqual(before);
    expect(s1).not.toEqual(s);
    expect(randPick(s, ["a", "b", "c"])).toEqual(randPick(s, ["a", "b", "c"]));
    expect(randShuffle(s, [1, 2, 3, 4])).toEqual(randShuffle(s, [1, 2, 3, 4]));
  });
});

describe("run: 初期状態", () => {
  it("HP30・CPU3・開始スキル4枚・開始部屋 r0・1階は generateFloor(seed, 1)", () => {
    const s = initRun("s");
    expect(s.version).toBe(RULES_VERSION);
    expect(s.phase).toBe("map");
    expect(s.roomId).toBe("r0");
    expect(s.player).toMatchObject({ hp: 30, maxHp: 30, cpu: 3, cpuMax: 3 });
    expect([...s.player.skills].sort()).toEqual(["hotfix", "patch", "read-log", "reproduce"]);
    expect(s.floor).toEqual(generateFloor("s", 1));
    expect(s.floor.number).toBe(1);
  });
});

describe("run: 1部屋移動 → off-by-one を倒せる（固定の階・固定シード＋固定入力）", () => {
  const SEED = "s2-golden";
  const INPUT: Action[] = [
    { t: "move", room: "r1" },
    { t: "skill", id: "reproduce" },
    { t: "skill", id: "read-log" },
    { t: "endTurn" },
    { t: "skill", id: "patch", arg: "off-by-one" },
  ];

  it("撃破すると階のバグが0になり、階段が開く（まだ won ではない）", () => {
    const states: RunState[] = [];
    INPUT.reduce((s, a) => {
      const n = apply(s, a);
      expect(n.lastError, JSON.stringify(a)).toBeNull();
      states.push(n);
      return n;
    }, initFixedRun(SEED));

    const [moved, reproduced, readLog, ended, patched] = states as [
      RunState,
      RunState,
      RunState,
      RunState,
      RunState,
    ];
    expect(moved.phase).toBe("battle");
    expect(moved.roomId).toBe("r1");
    expect(moved.battle).toMatchObject({ bug: "off-by-one", hp: 15, reproduced: false });
    expect(moved.battle!.candidates).toEqual(["off-by-one", "null-ref"]);

    expect(reproduced.battle!.reproduced).toBe(true);
    expect(reproduced.battle!.symptoms).toHaveLength(1);
    expect(reproduced.player.cpu).toBe(2);

    expect(readLog.battle!.candidates).toEqual(["off-by-one"]);
    expect(readLog.player.cpu).toBe(1);

    // off-by-one は予告(3)より1多い 4 ダメージ。CPU は 3 に戻る
    expect(ended.player.hp).toBe(26);
    expect(ended.player.cpu).toBe(3);

    expect(patched.phase).toBe("map");
    expect(stairsOpen(patched)).toBe(true);
    expect(patched.battle).toBeNull();
    expect(patched.stats).toEqual({ bugsClosed: 1, turns: 1, degrades: 0 });
    expect(patched.floor.rooms.find((r) => r.id === "r1")!.content).toEqual({ kind: "empty" });
    expect(patched.events.map((e) => e.t)).toEqual(["bugDamaged", "bugClosed", "stairsOpened"]);
  });

  it("撃破してマップに戻ったら CPU は上限に戻っている（戦闘の残りをマップに持ち越さない）", () => {
    // patch(CPU2) を払った残りの 1 が戦闘後に残ると、マップ画面の CPU に「1/3」と出てしまう
    const patched = INPUT.reduce((s, a) => apply(s, a), initFixedRun(SEED));
    expect(patched.phase).toBe("map");
    expect(patched.battle).toBeNull();
    expect(patched.player.cpu).toBe(patched.player.cpuMax);
    expect(patched.player.cpu).toBe(data.player.cpuPerTurn);
  });

  it("同じシード＋同じ入力なら最後の状態が一致する（runReplay と同じ）", () => {
    const real = initRun(SEED);
    const r1 = real.floor.rooms.find((r) => r.id === "r1")!;
    const input: Action[] = [{ t: "move", room: r1.id }, { t: "endTurn" }, { t: "endTurn" }];
    const a = input.reduce((s, x) => apply(s, x), real);
    const b = runReplay(runReducer, {
      game: "log-dive",
      version: RULES_VERSION,
      seed: SEED,
      actions: input,
    });
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("apply は入力の state を変えない", () => {
    let s = initFixedRun(SEED);
    for (const a of INPUT) {
      const before = JSON.stringify(s);
      const n = apply(s, a);
      expect(JSON.stringify(s)).toBe(before);
      s = n;
    }
  });
});

describe("run: 不正な操作は lastError（例外にしない・状態は変えない）", () => {
  function expectRejected(s: RunState, a: Action, code: string): RunState {
    const n = apply(s, a);
    expect(n.lastError?.code).toBe(code);
    expect(n.lastError?.message.length).toBeGreaterThan(0);
    expect({ ...n, lastError: null, events: [] }).toEqual({ ...s, lastError: null, events: [] });
    return n;
  }

  it("隣でない部屋・無い部屋への移動", () => {
    const s = initFixedRun("e");
    expectRejected(s, { t: "move", room: "r2" }, "not_adjacent");
    expectRejected(s, { t: "move", room: "nope" }, "unknown_room");
  });

  it("戦闘中の移動、戦闘外のスキル・ターン終了", () => {
    expectRejected(bugHere("e"), { t: "move", room: "r0" }, "in_battle");
    expectRejected(initFixedRun("e"), { t: "skill", id: "hotfix" }, "not_in_battle");
    expectRejected(initFixedRun("e"), { t: "endTurn" }, "not_in_battle");
  });

  it("未再現のバグへの patch", () => {
    expectRejected(bugHere("e"), { t: "skill", id: "patch", arg: "off-by-one" }, "not_reproduced");
  });

  it("消えた候補・候補に無い種類への patch、種類の指定なし", () => {
    const s = play("e", [
      { t: "move", room: "r1" },
      { t: "skill", id: "reproduce" },
      { t: "skill", id: "read-log" },
    ]);
    expectRejected(s, { t: "skill", id: "patch", arg: "null-ref" }, "not_a_candidate");
    expectRejected(s, { t: "skill", id: "patch", arg: "leak" }, "not_a_candidate");
    expectRejected(s, { t: "skill", id: "patch" }, "missing_arg");
  });

  it("候補1つでの read-log", () => {
    const s = play("e", [
      { t: "move", room: "r1" },
      { t: "skill", id: "read-log" },
    ]);
    expectRejected(s, { t: "skill", id: "read-log" }, "too_few_candidates");
  });

  it("CPU 不足・持っていないスキル", () => {
    const s = play("e", [
      { t: "move", room: "r1" },
      { t: "skill", id: "reproduce" },
      { t: "skill", id: "hotfix" },
    ]);
    expectRejected(s, { t: "skill", id: "patch", arg: "off-by-one" }, "not_enough_cpu");
    expectRejected(bugHere("e"), { t: "skill", id: "bisect" }, "skill_not_owned");
  });

  it("症状を全部出したあとの reproduce", () => {
    const s = play("e", [
      { t: "move", room: "r1" },
      { t: "skill", id: "reproduce" },
      { t: "skill", id: "reproduce" },
      { t: "endTurn" },
      { t: "skill", id: "reproduce" },
    ]);
    expect(s.battle!.symptoms).toHaveLength(3);
    expectRejected(s, { t: "skill", id: "reproduce" }, "nothing_to_reveal");
  });

  it("宝箱が無いところでの loot", () => {
    expectRejected(initFixedRun("e"), { t: "loot", pick: "bisect" }, "no_loot");
  });

  it("成功した操作で lastError は null に戻る", () => {
    const bad = apply(initFixedRun("e"), { t: "move", room: "r2" });
    expect(apply(bad, { t: "move", room: "r1" }).lastError).toBeNull();
  });
});

describe("battle: スキルとバグ", () => {
  it("公開される症状はそのバグの症状。公開順はシードで決まり、同じシードなら同じ", () => {
    const syms = data.bugs.bugs.find((b) => b.id === "off-by-one")!.symptoms;
    const firstBySeed = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const s = play(`sym-${i}`, [
        { t: "move", room: "r1" },
        { t: "skill", id: "reproduce" },
      ]);
      const first = s.battle!.symptoms[0]!;
      expect(syms).toContain(first);
      firstBySeed.add(first);
      expect(
        play(`sym-${i}`, [
          { t: "move", room: "r1" },
          { t: "skill", id: "reproduce" },
        ]).battle!.symptoms,
      ).toEqual([first]);
    }
    expect(firstBySeed.size).toBeGreaterThan(1);
  });

  it("read-log は正解を消さない（シード200個）", () => {
    for (let i = 0; i < 200; i++) {
      const s = play(`rl-${i}`, [
        { t: "move", room: "r1" },
        { t: "skill", id: "read-log" },
      ]);
      expect(s.battle!.candidates).toEqual(["off-by-one"]);
    }
  });

  it("hotfix は種類に関係なく 3 ダメージ", () => {
    const s = play("h", [
      { t: "move", room: "r1" },
      { t: "skill", id: "hotfix" },
    ]);
    expect(s.battle!.hp).toBe(12);
    expect(s.events).toEqual([{ t: "bugDamaged", amount: 3 }]);
  });

  it("off-by-one は予告より1多いダメージ", () => {
    const s = bugHere("o");
    expect(s.battle!.intent.damage).toBe(3);
    expect(apply(s, { t: "endTurn" }).player.hp).toBe(30 - 4);
  });

  it("外れの patch はデグレ: バグ HP 全回復・デグレ数+1・増援は最大2", () => {
    let s = play("d", [
      { t: "move", room: "r1" },
      { t: "skill", id: "reproduce" },
      { t: "skill", id: "hotfix" },
    ]);
    expect(s.battle!.hp).toBe(12);
    for (let i = 1; i <= 3; i++) {
      s = apply(s, { t: "endTurn" });
      s = apply(s, { t: "skill", id: "patch", arg: "null-ref" });
      expect(s.lastError).toBeNull();
      expect(s.events).toEqual([{ t: "degrade" }]);
      expect(s.battle!.hp).toBe(15);
      expect(s.phase).toBe("battle");
      expect(s.stats.degrades).toBe(i);
      expect(s.reinforcements).toBe(Math.min(i, 2));
    }
  });

  it("HP が 0 になると負け。その後の操作は run_over", () => {
    let s = bugHere("l");
    let guard = 0;
    while (s.phase === "battle" && guard++ < 20) s = apply(s, { t: "endTurn" });
    expect(s.phase).toBe("lost");
    expect(s.player.hp).toBe(0);
    expect(s.events.at(-1)).toEqual({ t: "runEnd", phase: "lost" });
    expect(apply(s, { t: "endTurn" }).lastError?.code).toBe("run_over");
    expect(legalActions(s)).toEqual([]);
  });

  it("abandon でリザルトへ", () => {
    const s = apply(bugHere("a"), { t: "abandon" });
    expect(s.phase).toBe("abandoned");
    expect(s.events).toEqual([{ t: "runEnd", phase: "abandoned" }]);
  });
});

describe("legalActions", () => {
  it("返した操作はすべて lastError にならない。未再現なら patch は含まない", () => {
    const s = bugHere("la");
    const acts = legalActions(s);
    expect(acts.some((a) => a.t === "skill" && a.id === "patch")).toBe(false);
    for (const a of acts) expect(apply(s, a).lastError).toBeNull();
    expect(legalActions(initFixedRun("la"))).toEqual([{ t: "abandon" }, { t: "move", room: "r1" }]);
  });

  it("合法手をランダムに打つ BOT が例外を出さず必ず終わる（シード200個・上限3000手）", () => {
    for (let i = 0; i < 200; i++) {
      let s = initRun(`bot-${i}`);
      let rng = seedFrom(`bot-pick-${i}`);
      let steps = 0;
      while (legalActions(s).length > 0 && steps < 3000) {
        // abandon を除いて選ぶ（すぐ終わらないように）
        const acts = legalActions(s).filter((a) => a.t !== "abandon");
        const [a, next] = randPick(rng, acts);
        rng = next;
        s = apply(s, a);
        expect(s.lastError).toBeNull();
        steps++;
      }
      expect(["won", "lost"]).toContain(s.phase);
    }
  });
});
