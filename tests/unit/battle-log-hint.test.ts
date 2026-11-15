import { describe, expect, it } from "vitest";
import { isRunError, logRemovable, startBattle, useSkill } from "../../src/core/battle";
import floorsJson from "../../src/data/floors.json";
import { loadGameData, type BugId } from "../../src/core/data";
import type { BattleState, PlayerState } from "../../src/core/run";

const data = loadGameData();
const player: PlayerState = {
  hp: 30,
  hpMax: 30,
  cpu: 3,
  cpuMax: 3,
  skills: ["reproduce", "read-log", "hotfix", "patch"],
} as unknown as PlayerState;

function battle(bug: BugId, candidates: BugId[], symptoms: string[], boss = false): BattleState {
  return {
    ...startBattle({ data, runSeed: "s", n: 1, roomId: "r", bug, candidates, boss }),
    symptoms,
  };
}

const POOL: BugId[] = ["off-by-one", "null-ref", "infinite-loop", "leak"];

describe("ログ確認は症状と食い違う候補から消す（#118）", () => {
  it("症状が無いうちは外れ候補すべてが対象（従来どおり）", () => {
    expect(logRemovable(data, battle("infinite-loop", POOL, [])).sort()).toEqual(
      ["leak", "null-ref", "off-by-one"].sort(),
    );
  });

  it("「応答が遅い」が出たら、持たない種類だけが対象（leak は残る）", () => {
    const b = battle("infinite-loop", POOL, ["応答が遅い"]);
    expect(logRemovable(data, b).sort()).toEqual(["null-ref", "off-by-one"]);
  });

  it("食い違う外れ候補が尽きたら、症状の合う外れ候補から消す", () => {
    const b = battle("infinite-loop", ["infinite-loop", "leak"], ["応答が遅い"]);
    expect(logRemovable(data, b)).toEqual(["leak"]);
  });

  it("ボスのノイズ症状は手がかりにしない", () => {
    const noise = data.bugs.boss.noiseSymptom;
    const b = battle("race", ["race", "null-ref", "leak"], [noise], true);
    expect(logRemovable(data, b).sort()).toEqual(["leak", "null-ref"]);
  });

  it("useSkill(read-log) は食い違う候補を消し、正解は消さない（全シード）", () => {
    for (let n = 0; n < 50; n++) {
      const b0 = {
        ...startBattle({
          data,
          runSeed: `r${n}`,
          n,
          roomId: "r",
          bug: "infinite-loop",
          candidates: POOL,
        }),
        symptoms: ["応答が遅い"],
      };
      const r = useSkill(data, b0, player, "read-log", undefined);
      if (isRunError(r)) throw new Error(r.message);
      expect(r.battle.candidates).toContain("infinite-loop");
      expect(r.battle.candidates).toContain("leak");
      expect(r.battle.candidates.length).toBe(3);
    }
  });
});

describe("2階の手がかり・難度データ（#118）", () => {
  const floor2 = floorsJson.floors.find((f) => f.number === 2);
  it("2階の pool では、どの症状も1種類にしか当てはまらない（再現1回で種類が決まる）", () => {
    const seen = new Map<string, BugId>();
    for (const id of floor2?.pool ?? []) {
      for (const s of data.bugs.bugs.find((b) => b.id === (id as string))?.symptoms ?? []) {
        expect(seen.has(s), `症状「${s}」が重複`).toBe(false);
        seen.set(s, id as BugId);
      }
    }
  });

  it("null-ref の大ダメージは6（周期3: 1,1,6）。放置してもダウンは10ターン以上", () => {
    const nr = data.bugs.bugs.find((b) => b.id === "null-ref")?.behavior;
    expect(nr).toMatchObject({ kind: "null-ref", damage: 1, bigDamage: 6, period: 3 });
    // 1,1,6 を繰り返して HP30 を削る
    let hp = 30;
    let turns = 0;
    while (hp > 0) hp -= [1, 1, 6][turns++ % 3] as number;
    expect(turns).toBeGreaterThanOrEqual(10);
  });
});
