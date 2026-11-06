/**
 * breakpoint・bisect（Issue #28 / spec-a v0.1 §4 / v0.2 決定6・7・8）。
 * 縦切りの固定階は候補2つなので、戦闘だけ差し替えて候補5つでも確かめる。
 */
import { describe, expect, it } from "vitest";
import { startBattle } from "../../src/core/battle";
import { BUG_IDS, bugDef, loadGameData, type BugId } from "../../src/core/data";
import { apply, initRun, legalActions, type RunState } from "../../src/core/run";

const data = loadGameData();
const SEEDS = Array.from({ length: 300 }, (_, i) => `sk28-${i}`);

/** r1 で戦闘中・6枚持ち・CPU 多め（CPU 以外の条件だけを見るため）。 */
function battleWith(
  bug: BugId,
  seed = "s",
  candidates: readonly BugId[] = BUG_IDS,
  cpu = 99,
): RunState {
  const s = apply(initRun(seed), { t: "move", room: "r1" });
  const battle = startBattle({ data, runSeed: seed, n: 0, roomId: "r1", bug, candidates });
  const skills = data.skills.skills.map((x) => x.id);
  return { ...s, battle, player: { ...s.player, skills, cpu, cpuMax: Math.min(cpu, 3) } };
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

  it("2回続けては使えない（lastError・CPU を使わない・legalActions から外れる）", () => {
    const bp = apply(battleWith("race", "twice"), { t: "skill", id: "breakpoint" });
    const again = apply(bp, { t: "skill", id: "breakpoint" });
    expect(again.lastError?.code).toBe("already_halted");
    expect(again.player.cpu).toBe(bp.player.cpu);
    expect(legalActions(bp)).not.toContainEqual({ t: "skill", id: "breakpoint" });
  });

  it("持っていなければ使えない（初期スキルには無い）", () => {
    const s = apply(initRun("e"), { t: "move", room: "r1" });
    expect(apply(s, { t: "skill", id: "breakpoint" }).lastError?.code).toBe("skill_not_owned");
    expect(legalActions(s)).not.toContainEqual({ t: "skill", id: "breakpoint" });
  });

  it("CPU 不足なら lastError", () => {
    const s = battleWith("race", "cpu", BUG_IDS, 1);
    expect(apply(s, { t: "skill", id: "breakpoint" }).lastError?.code).toBe("not_enough_cpu");
    expect(apply(s, { t: "skill", id: "bisect" }).lastError?.code).toBe("not_enough_cpu");
  });
});
