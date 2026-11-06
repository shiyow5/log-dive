/**
 * breakpoint・bisect（Issue #28 / spec-a v0.1 §4 / v0.2 決定6・7・8）。
 * 縦切りの固定階は候補2つなので、戦闘だけ差し替えて候補5つでも確かめる。
 */
import { describe, expect, it } from "vitest";
import { initFixedRun } from "./fixed-run";
import { startBattle } from "../../src/core/battle";
import { BUG_IDS, bugDef, loadGameData, type BugId } from "../../src/core/data";
import {
  apply,
  legalActions,
  RULES_VERSION,
  type FloorState,
  type RunState,
} from "../../src/core/run";
import { seedFrom } from "../../src/core/rng";

const data = loadGameData();
const SEEDS = Array.from({ length: 300 }, (_, i) => `sk28-${i}`);

/** r1 で戦闘中・6枚持ち・CPU 多め（CPU 以外の条件だけを見るため）。 */
function battleWith(
  bug: BugId,
  seed = "s",
  candidates: readonly BugId[] = BUG_IDS,
  cpu = 99,
): RunState {
  const battle = startBattle({ data, runSeed: seed, n: 0, roomId: "r1", bug, candidates });
  const skills = data.skills.skills.map((x) => x.id);
  const floor: FloorState = {
    number: 1,
    boss: false,
    rooms: [
      {
        id: "r0",
        label: "main()",
        x: 0,
        y: 0,
        neighbors: ["r1"],
        visited: true,
        content: { kind: "empty" },
      },
      {
        id: "r1",
        label: "parse()",
        x: 1,
        y: 0,
        neighbors: ["r0", "r2"],
        visited: true,
        content: { kind: "bug", bugs: [bug] },
      },
      {
        id: "r2",
        label: "render()",
        x: 2,
        y: 0,
        neighbors: ["r1"],
        visited: false,
        content: { kind: "empty" },
      },
    ],
  };
  return {
    version: RULES_VERSION,
    seed,
    phase: "battle",
    floors: [floor],
    currentFloor: 1,
    roomId: "r1",
    player: { hp: 30, maxHp: 30, cpu, cpuMax: Math.min(cpu, 3), skills },
    battle,
    floorRng: seedFrom(`floor:${seed}:1`),
    battleCount: 1,
    reinforcements: 0,
    stats: { bugsClosed: 0, turns: 0, degrades: 0 },
    lastError: null,
    events: [],
  };
}

describe("bisect: 候補を半分（切り捨て）消す。2以下なら1つ", () => {
  it.each([
    [5, 3],
    [4, 2],
    [3, 2],
    [2, 1],
  ])("候補 %i → %i", (n, left) => {
    for (const seed of SEEDS) {
      for (const bug of BUG_IDS.slice(0, n)) {
        const s = battleWith(bug, seed, BUG_IDS.slice(0, n));
        const next = apply(s, { t: "skill", id: "bisect" });
        expect(next.lastError).toBeNull();
        expect(next.battle!.candidates).toHaveLength(left);
        // 正解は消さない＝推理が必ず成立する
        expect(next.battle!.candidates).toContain(bug);
        expect(next.player.cpu).toBe(s.player.cpu - 2);
        expect(next.events.filter((e) => e.t === "candidateRemoved")).toHaveLength(n - left);
      }
    }
  });

  it("繰り返すと必ず正解1つに絞れる（5→3→2→1）", () => {
    for (const seed of SEEDS) {
      for (const bug of BUG_IDS) {
        let s = battleWith(bug, seed);
        const sizes: number[] = [];
        while (s.battle!.candidates.length > 1) {
          s = apply(s, { t: "skill", id: "bisect" });
          expect(s.lastError).toBeNull();
          sizes.push(s.battle!.candidates.length);
        }
        expect(sizes).toEqual([3, 2, 1]);
        expect(s.battle!.candidates).toEqual([bug]);
      }
    }
  });

  it("候補1つでは lastError・CPU を使わない・legalActions から外れる", () => {
    const s = battleWith("leak", "e", ["leak"]);
    const next = apply(s, { t: "skill", id: "bisect" });
    expect(next.lastError?.code).toBe("too_few_candidates");
    expect(next.player.cpu).toBe(s.player.cpu);
    expect(next.battle).toEqual(s.battle);
    expect(legalActions(s)).not.toContainEqual({ t: "skill", id: "bisect" });
  });

  it("同じシードなら同じ候補が消える", () => {
    const a = apply(battleWith("race", "same"), { t: "skill", id: "bisect" });
    const b = apply(battleWith("race", "same"), { t: "skill", id: "bisect" });
    expect(a.battle!.candidates).toEqual(b.battle!.candidates);
  });
});

describe("breakpoint: 次のバグ行動を1回止める＋症状を1つ公開", () => {
  it("症状を1つ公開し、次のターン終了でダメージを受けない", () => {
    for (const bug of BUG_IDS) {
      const s = battleWith(bug, "bp");
      const bp = apply(s, { t: "skill", id: "breakpoint" });
      expect(bp.lastError).toBeNull();
      expect(bp.player.cpu).toBe(s.player.cpu - 2);
      expect(bp.battle!.symptoms).toEqual([s.battle!.hiddenSymptoms[0]]);
      expect(bp.battle!.halted).toBe(true);

      const end = apply(bp, { t: "endTurn" });
      expect(end.lastError).toBeNull();
      expect(end.player.hp).toBe(bp.player.hp);
      expect(end.battle!.halted).toBe(false);
      expect(end.battle!.turn).toBe(bp.battle!.turn + 1);
      // 止めた回は予告もカウンタも進めない（v0.2 決定6）
      expect(end.battle!.intent).toEqual(bp.battle!.intent);
      expect(end.events.map((e) => e.t)).toEqual(["bugHaltedTurn"]);

      // 止めるのは1回だけ。その次は普通に行動する
      const again = apply({ ...end, player: { ...end.player, hp: 999 } }, { t: "endTurn" });
      expect(again.player.hp).toBeLessThan(999);
    }
  });

  it("止めたターンは infinite-loop の CPU 減少も起きない", () => {
    const s = battleWith("infinite-loop", "il", BUG_IDS, 3);
    const end = apply(apply(s, { t: "skill", id: "breakpoint" }), { t: "endTurn" });
    expect(end.player.cpu).toBe(end.player.cpuMax);
  });

  it("null-ref のカウンタは止めた回に進まない", () => {
    const b = bugDef(data, "null-ref").behavior;
    if (b.kind !== "null-ref") throw new Error("bugs.json の null-ref の kind が違う");
    const s = battleWith("null-ref", "nr");
    const end = apply(apply(s, { t: "skill", id: "breakpoint" }), { t: "endTurn" });
    expect(end.battle!.intent.countdown).toBe(s.battle!.intent.countdown);
  });

  it("症状が出きっていても止める効果はある", () => {
    let s = battleWith("leak", "all");
    for (let i = 0; i < 3; i++) s = apply(s, { t: "skill", id: "reproduce" });
    expect(s.battle!.hiddenSymptoms).toHaveLength(0);
    const bp = apply(s, { t: "skill", id: "breakpoint" });
    expect(bp.lastError).toBeNull();
    expect(bp.battle!.symptoms).toEqual(s.battle!.symptoms);
    expect(bp.events.map((e) => e.t)).toEqual(["halted"]);
  });

  it("breakpoint で症状を出し切っても、未再現なら reproduce→patch で倒せる（PR #41 QA 指摘1）", () => {
    let s = battleWith("off-by-one", "jin41", BUG_IDS, 3);
    for (let i = 0; i < 3; i++) {
      s = apply(s, { t: "skill", id: "breakpoint" });
      expect(s.lastError).toBeNull();
      s = apply(s, { t: "endTurn" });
      expect(s.lastError).toBeNull();
    }
    expect(s.battle!.hiddenSymptoms).toHaveLength(0);
    expect(s.battle!.reproduced).toBe(false);
    expect(legalActions(s)).toContainEqual({ t: "skill", id: "reproduce" });

    const rep = apply(s, { t: "skill", id: "reproduce" });
    expect(rep.lastError).toBeNull();
    expect(rep.battle!.reproduced).toBe(true);
    expect(rep.battle!.symptoms).toEqual(s.battle!.symptoms);
    expect(rep.player.cpu).toBe(s.player.cpu - 1);

    expect(rep.battle!.hp).toBe(15);
    const fixed = apply(rep, { t: "skill", id: "patch", arg: "off-by-one" });
    expect(fixed.lastError).toBeNull();
    // patch は 20 ダメージ。残り HP 15 で頭打ちになり、バグが閉じる
    expect(fixed.events).toContainEqual({ t: "bugDamaged", amount: 15 });
    expect(fixed.events).toContainEqual({ t: "bugClosed", bug: "off-by-one" });
  });

  it("2回続けては使えない（lastError・CPU を使わない・legalActions から外れる）", () => {
    const bp = apply(battleWith("race", "twice"), { t: "skill", id: "breakpoint" });
    const again = apply(bp, { t: "skill", id: "breakpoint" });
    expect(again.lastError?.code).toBe("already_halted");
    expect(again.player.cpu).toBe(bp.player.cpu);
    expect(legalActions(bp)).not.toContainEqual({ t: "skill", id: "breakpoint" });
  });

  it("持っていなければ使えない（初期スキルには無い）", () => {
    const s = apply(initFixedRun("e"), { t: "move", room: "r1" });
    expect(apply(s, { t: "skill", id: "breakpoint" }).lastError?.code).toBe("skill_not_owned");
    expect(legalActions(s)).not.toContainEqual({ t: "skill", id: "breakpoint" });
  });

  it("CPU 不足なら lastError", () => {
    const s = battleWith("race", "cpu", BUG_IDS, 1);
    expect(apply(s, { t: "skill", id: "breakpoint" }).lastError?.code).toBe("not_enough_cpu");
    expect(apply(s, { t: "skill", id: "bisect" }).lastError?.code).toBe("not_enough_cpu");
  });
});
