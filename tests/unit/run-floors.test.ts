/**
 * Issue #35: run.ts を generateFloor につなぐ（階段・次の階・宝箱 loot・ボス戦）。
 */
import { describe, expect, it } from "vitest";
import { bossDef, loadGameData, type SkillId } from "../../src/core/data";
import { floorCount, generateFloor } from "../../src/core/floor";
import {
  apply,
  initRun,
  legalActions,
  stairsOpen,
  type RoomState,
  type RunState,
} from "../../src/core/run";
import { oracleAction } from "../qa/oracle";

const data = loadGameData();
const boss = bossDef(data);

function room(s: RunState, pred: (r: RoomState) => boolean): RoomState | undefined {
  return s.floor.rooms.find(pred);
}

function playOracle(seed: string, until: (s: RunState) => boolean = () => false): RunState {
  let s = initRun(seed);
  for (let i = 0; i < 500 && s.phase !== "won" && s.phase !== "lost" && !until(s); i++) {
    s = apply(s, oracleAction(s));
    expect(s.lastError, `${seed} #${i}`).toBeNull();
  }
  return s;
}

describe("階段と次の階", () => {
  it("バグが残っている間は階段の部屋に入っても降りない", () => {
    const s0 = initRun("stairs-closed");
    const stairs = room(s0, (r) => r.content.kind === "stairs")!;
    // 階段の隣の部屋に立っている状態を作る（道中のバグ戦は別のテストで見る）
    const s: RunState = { ...s0, roomId: stairs.neighbors[0] as string };
    const n = apply(s, { t: "move", room: stairs.id });
    expect(n.lastError).toBeNull();
    expect(n.floor.number).toBe(1);
    expect(n.roomId).toBe(stairs.id);
    expect(n.events).toEqual([{ t: "moved", room: stairs.id }]);
    expect(stairsOpen(n)).toBe(false);
  });

  it("全部閉じると stairsOpened → 階段の部屋で generateFloor(seed, 2) へ。r0 から始まる", () => {
    const seed = "stairs-open";
    const s = playOracle(seed, (x) => x.floor.number === 2);
    expect(s.floor.number).toBe(2);
    expect(s.floor).toEqual(generateFloor(seed, 2, { reinforcements: 0 }));
    expect(s.roomId).toBe("r0");
    expect(s.events.map((e) => e.t)).toEqual(["moved", "descended"]);
    expect(s.events.at(-1)).toEqual({ t: "descended", floor: 2 });
  });

  it("デグレの数だけ次の階に増援が入り、降りたら 0 に戻る", () => {
    const seed = "reinf";
    let s = initRun(seed);
    // 最初のバグ戦でわざと1回外す
    for (let i = 0; i < 200 && s.stats.degrades === 0; i++) {
      if (s.phase === "battle" && s.battle?.reproduced && s.player.cpu >= 2) {
        const wrong = s.battle.candidates.find((c) => c !== s.battle!.bug)!;
        s = apply(s, { t: "skill", id: "patch", arg: wrong });
      } else {
        s = apply(s, oracleAction(s));
      }
    }
    expect(s.reinforcements).toBe(1);
    for (let i = 0; i < 300 && s.floor.number === 1; i++) s = apply(s, oracleAction(s));
    expect(s.floor).toEqual(generateFloor(seed, 2, { reinforcements: 1 }));
    expect(s.reinforcements).toBe(0);
  });

  it("最後の階には階段が無く、stairsOpen は常に false", () => {
    const s = playOracle("last", (x) => x.floor.number === floorCount());
    expect(s.floor.rooms.some((r) => r.content.kind === "stairs")).toBe(false);
    expect(stairsOpen(s)).toBe(false);
  });
});

describe("宝箱 loot", () => {
  /** 1階の宝箱の部屋に着いたところ。 */
  function atChest(seed: string): RunState {
    let s = initRun(seed);
    for (let i = 0; i < 200; i++) {
      const here = room(s, (r) => r.id === s.roomId)!;
      if (s.phase === "map" && here.content.kind === "chest") return s;
      s = apply(s, oracleAction(s));
    }
    throw new Error(`${seed}: 宝箱に着かない`);
  }

  it("スキルが増えて宝箱は消える。legalActions に loot が入る", () => {
    const s = atChest("chest");
    const skill = (room(s, (r) => r.id === s.roomId)!.content as { skill: SkillId }).skill;
    expect(skill).toBe("breakpoint");
    expect(legalActions(s)).toContainEqual({ t: "loot", pick: skill });
    const n = apply(s, { t: "loot", pick: skill });
    expect(n.lastError).toBeNull();
    expect(n.player.skills).toContain(skill);
    expect(n.player.skills).toHaveLength(5);
    expect(room(n, (r) => r.id === s.roomId)!.content).toEqual({ kind: "empty" });
    expect(n.events).toEqual([{ t: "looted", skill }]);
    expect(apply(n, { t: "loot", pick: skill }).lastError?.code).toBe("no_loot");
    expect(legalActions(n).some((a) => a.t === "loot")).toBe(false);
  });

  it("持っているスキルなら already_owned（状態・CPU は変わらない）", () => {
    const s0 = atChest("owned");
    const s: RunState = {
      ...s0,
      player: { ...s0.player, skills: [...s0.player.skills, "breakpoint"] },
    };
    const n = apply(s, { t: "loot", pick: "breakpoint" });
    expect(n.lastError?.code).toBe("already_owned");
    expect({ ...n, lastError: null, events: [] }).toEqual({ ...s, lastError: null, events: [] });
  });

  it("宝箱と違うスキル・宝箱の無い部屋は no_loot", () => {
    const s = atChest("other");
    expect(apply(s, { t: "loot", pick: "bisect" }).lastError?.code).toBe("no_loot");
    expect(apply(initRun("other"), { t: "loot", pick: "breakpoint" }).lastError?.code).toBe(
      "no_loot",
    );
  });
});

describe("3階のボス", () => {
  /** 3階のボス戦が始まったところ。 */
  function atBoss(seed: string): RunState {
    const s = playOracle(seed, (x) => x.battle?.boss === true);
    expect(s.battle?.boss).toBe(true);
    return s;
  }

  it(`HP${boss.hp}・正解パッチ${boss.patchesRequired}回で倒れて won`, () => {
    let s = atBoss("boss");
    expect(s.floor.number).toBe(3);
    expect(s.battle).toMatchObject({ hp: 30, maxHp: 30, patchesLeft: 2 });
    s = apply(s, { t: "skill", id: "reproduce" });
    s = apply(s, { t: "skill", id: "patch", arg: s.battle!.bug });
    expect(s.phase).toBe("battle");
    expect(s.battle).toMatchObject({ hp: 10, patchesLeft: 1 });
    s = apply(s, { t: "endTurn" });
    s = apply(s, { t: "skill", id: "patch", arg: s.battle!.bug });
    expect(s.phase).toBe("won");
    expect(s.events.at(-1)).toEqual({ t: "runEnd", phase: "won" });
  });

  it("HP を 0 にしても、パッチが足りないうちは倒れない", () => {
    let s = atBoss("boss-hp0");
    s = { ...s, battle: { ...s.battle!, hp: 0 }, player: { ...s.player, cpu: 99 } };
    s = apply(s, { t: "skill", id: "reproduce" });
    s = apply(s, { t: "skill", id: "patch", arg: s.battle!.bug });
    expect(s.phase).toBe("battle");
    expect(s.battle!.patchesLeft).toBe(1);
    s = apply(s, { t: "skill", id: "patch", arg: s.battle!.bug });
    expect(s.phase).toBe("won");
  });

  it("ボス戦でデグレすると最大 HP +5（上限35）で全回復", () => {
    let s = atBoss("boss-degrade");
    s = { ...s, player: { ...s.player, cpu: 99, hp: 99 } };
    s = apply(s, { t: "skill", id: "reproduce" });
    const wrong = s.battle!.candidates.find((c) => c !== s.battle!.bug)!;
    s = apply(s, { t: "skill", id: "patch", arg: wrong });
    expect(s.battle).toMatchObject({ hp: 35, maxHp: 35 });
    s = apply(s, { t: "skill", id: "patch", arg: wrong });
    expect(s.battle).toMatchObject({ hp: 35, maxHp: 35 });
  });

  it("3階でボスの前にデグレしていたら、ボスは HP35 で始まる", () => {
    const seed = "boss-pre";
    let s = playOracle(seed, (x) => x.floor.number === 3);
    s = { ...s, player: { ...s.player, hp: 99 } };
    for (let i = 0; i < 200 && s.stats.degrades === 0 && s.phase !== "won"; i++) {
      if (s.phase === "battle" && s.battle?.reproduced && s.player.cpu >= 2) {
        const wrong = s.battle.candidates.find((c) => c !== s.battle!.bug)!;
        s = apply(s, { t: "skill", id: "patch", arg: wrong });
      } else {
        s = apply(s, oracleAction(s));
      }
    }
    expect(s.battle?.boss).not.toBe(true);
    for (let i = 0; i < 200 && s.battle?.boss !== true; i++) s = apply(s, oracleAction(s));
    expect(s.battle).toMatchObject({ boss: true, hp: 35, maxHp: 35 });
  });
});

describe("BOT 1000 seed", () => {
  it("正体を知っている BOT は 1000 seed すべてで3階まで行き、6枚そろえてボスを倒す", () => {
    for (let i = 0; i < 1000; i++) {
      const seed = `reach-${i}`;
      let s = initRun(seed);
      let maxFloor = 1;
      for (let k = 0; k < 500 && s.phase !== "won" && s.phase !== "lost"; k++) {
        s = apply(s, oracleAction(s));
        if (s.lastError) throw new Error(`${seed} #${k}: ${s.lastError.code}`);
        maxFloor = Math.max(maxFloor, s.floor.number);
      }
      expect(maxFloor, seed).toBe(3);
      expect(s.phase, seed).toBe("won");
      expect([...s.player.skills].sort(), seed).toEqual(data.skills.skills.map((x) => x.id).sort());
    }
  });
});
