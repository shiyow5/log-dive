/**
 * バグの行動パターン（spec-a v0.1 §4 / v0.2 決定5・6・8）。
 * 縦切りの固定階には off-by-one しかいないので、戦闘だけ差し替えて確かめる。
 */
import { describe, expect, it } from "vitest";
import { initFixedRun } from "./fixed-run";
import { actualDamage, bugTurn, firstIntent, startBattle } from "../../src/core/battle";
import { BUG_IDS, bugDef, loadGameData, type BugId } from "../../src/core/data";
import { apply, legalActions, type Action, type RunState } from "../../src/core/run";

const data = loadGameData();
const FLOOR1: readonly BugId[] = ["off-by-one", "null-ref"];
const SEEDS = Array.from({ length: 200 }, (_, i) => `bugs-${i}`);

/** r1 に入って、戦闘だけ指定の種類（候補は全5種）にした状態。 */
function battleWith(bug: BugId, seed = "s", candidates: readonly BugId[] = BUG_IDS): RunState {
  const s = apply(initFixedRun(seed), { t: "move", room: "r1" });
  const battle = startBattle({ data, runSeed: seed, n: 0, roomId: "r1", bug, candidates });
  return { ...s, battle };
}

/** ターン終了を n 回して、各ターンのプレイヤー被ダメージを返す。 */
function damages(s: RunState, n: number): { amounts: number[]; last: RunState } {
  const amounts: number[] = [];
  let cur = { ...s, player: { ...s.player, hp: 999, maxHp: 999 } };
  for (let i = 0; i < n; i++) {
    const next = apply(cur, { t: "endTurn" });
    expect(next.lastError).toBeNull();
    amounts.push(cur.player.hp - next.player.hp);
    cur = next;
  }
  return { amounts, last: cur };
}

describe("null-ref: period ターンに1回 大ダメージ（予告とカウンタ）", () => {
  const b = bugDef(data, "null-ref").behavior;
  if (b.kind !== "null-ref") throw new Error("bugs.json の null-ref の kind が違う");

  it("開始時の予告は countdown=period-1・小ダメージ", () => {
    expect(firstIntent(data, "null-ref")).toEqual({ damage: b.damage, countdown: b.period - 1 });
  });

  it("countdown が 0 のターンに bigDamage。予告どおりに入り、発動後は period-1 に戻る", () => {
    let s = battleWith("null-ref");
    const seen: { countdown?: number; damage: number; actual: number }[] = [];
    s = { ...s, player: { ...s.player, hp: 999 } };
    for (let i = 0; i < b.period * 3; i++) {
      const intent = s.battle!.intent;
      const next = apply(s, { t: "endTurn" });
      seen.push({ ...intent, actual: s.player.hp - next.player.hp });
      s = next;
    }
    // period=3: 1,1,8,1,1,8,...（3ターン目・6ターン目・9ターン目が大ダメージ）
    for (const [i, x] of seen.entries()) {
      const big = (i + 1) % b.period === 0;
      expect(x.countdown).toBe(b.period - 1 - (i % b.period));
      expect(x.damage).toBe(big ? b.bigDamage : b.damage);
      expect(x.actual).toBe(x.damage);
    }
  });

  it("ほかの種類の予告には countdown が無い", () => {
    for (const id of BUG_IDS.filter((x) => x !== "null-ref")) {
      expect(firstIntent(data, id).countdown).toBeUndefined();
    }
  });
});

describe("race: ダメージは予告の multipliers 倍（戦闘用乱数）", () => {
  const b = bugDef(data, "race").behavior;
  if (b.kind !== "race") throw new Error("bugs.json の race の kind が違う");

  it("各ターン 0 か 2倍。シード200個で両方出る", () => {
    const all = new Set<number>();
    for (const seed of SEEDS) {
      for (const a of damages(battleWith("race", seed), 5).amounts) all.add(a);
    }
    expect([...all].sort((x, y) => x - y)).toEqual(b.multipliers.map((m) => m * b.damage));
  });

  it("同じシードなら同じ並び（決定的）。戦闘用乱数は1ターンに1回だけ進む", () => {
    const s = battleWith("race", "race-fixed");
    expect(damages(s, 8).amounts).toEqual(damages(s, 8).amounts);
    const [, rng] = actualDamage(data, s.battle!);
    const r = bugTurn(data, s.battle!, s.player);
    expect(r.battle.rng).toEqual(rng);
    expect(rng).not.toEqual(s.battle!.rng);
  });

  it("予告は毎ターン同じ（基本ダメージを出す）", () => {
    const { last } = damages(battleWith("race"), 4);
    expect(last.battle!.intent).toEqual({ damage: b.damage });
  });
});

describe("leak: ダメージが行動ごとに growth ずつ増える", () => {
  const b = bugDef(data, "leak").behavior;
  if (b.kind !== "leak") throw new Error("bugs.json の leak の kind が違う");

  it("予告どおりに入り、予告は damage, damage+growth, damage+2*growth, …", () => {
    let s = battleWith("leak");
    s = { ...s, player: { ...s.player, hp: 999 } };
    for (let i = 0; i < 6; i++) {
      const expected = b.damage + b.growth * i;
      expect(s.battle!.intent).toEqual({ damage: expected });
      const next = apply(s, { t: "endTurn" });
      expect(s.player.hp - next.player.hp).toBe(expected);
      s = next;
    }
  });

  it("新しい戦闘では最初の damage に戻る", () => {
    expect(firstIntent(data, "leak")).toEqual({ damage: b.damage });
  });
});

describe("infinite-loop: 次ターンの CPU を cpuDrain 減らす", () => {
  const b = bugDef(data, "infinite-loop").behavior;
  if (b.kind !== "infinite-loop") throw new Error("bugs.json の infinite-loop の kind が違う");

  it("戦闘の1ターン目は cpuMax。以後は毎ターン cpuMax-cpuDrain（減り続けない）", () => {
    let s = battleWith("infinite-loop");
    expect(s.player.cpu).toBe(s.player.cpuMax);
    for (let i = 0; i < 4; i++) {
      s = apply(s, { t: "endTurn" });
      expect(s.player.cpu).toBe(s.player.cpuMax - b.cpuDrain);
      expect(s.player.cpuMax).toBe(3);
    }
  });

  it("順序: 上限にリセット → drain（使い切っても使い残しても同じ値）", () => {
    let used = battleWith("infinite-loop");
    used = apply(used, { t: "skill", id: "reproduce" });
    used = apply(used, { t: "skill", id: "reproduce" });
    used = apply(used, { t: "skill", id: "hotfix" });
    expect(used.player.cpu).toBe(0);
    const fromZero = apply(used, { t: "endTurn" });
    const fromFull = apply(battleWith("infinite-loop"), { t: "endTurn" });
    expect(fromZero.player.cpu).toBe(used.player.cpuMax - b.cpuDrain);
    expect(fromFull.player.cpu).toBe(fromZero.player.cpu);
  });

  it("CPU が足りないターンの patch は not_enough_cpu で、legalActions に出ない", () => {
    let s = battleWith("infinite-loop");
    s = apply(s, { t: "skill", id: "reproduce" });
    s = apply(s, { t: "endTurn" }); // CPU 2
    s = apply(s, { t: "skill", id: "hotfix" }); // CPU 1
    const r = apply(s, { t: "skill", id: "patch", arg: "infinite-loop" });
    expect(r.lastError?.code).toBe("not_enough_cpu");
    expect(r.player.cpu).toBe(1);
    expect(legalActions(s).some((a) => a.t === "skill" && a.id === "patch")).toBe(false);
  });

  it("ダメージは予告どおり（増えない）", () => {
    expect(damages(battleWith("infinite-loop"), 5).amounts).toEqual(Array(5).fill(b.damage));
  });
});

describe("CPU は毎ターン上限にリセット（持ち越しなし。v0.2 決定5）", () => {
  it.each(["null-ref", "race", "leak"] as const)("%s: 使い残しても次のターンは cpuMax", (bug) => {
    let s = battleWith(bug);
    s = apply(s, { t: "skill", id: "reproduce" });
    expect(s.player.cpu).toBe(s.player.cpuMax - 1);
    s = apply(s, { t: "endTurn" });
    expect(s.player.cpu).toBe(s.player.cpuMax);
    s = apply(s, { t: "endTurn" });
    expect(s.player.cpu).toBe(s.player.cpuMax);
  });
});

describe("推理が必ず成立する（null-ref・race・leak・infinite-loop）", () => {
  /** 公開済みの症状をすべて持つ候補。 */
  function consistent(s: RunState): BugId[] {
    const shown = s.battle!.symptoms;
    return s.battle!.candidates.filter((c) =>
      shown.every((t) => bugDef(data, c).symptoms.includes(t)),
    );
  }

  it.each(["null-ref", "race", "leak", "infinite-loop"] as const)(
    "%s: 症状を全部出すと、候補（全5種・1階の2種）のうち当てはまるのは正体だけ（シード200個）",
    (bug) => {
      for (const seed of SEEDS) {
        // 1階の候補は off-by-one・null-ref の2種（v0.2 決定3）。race は2階以降だけ
        const sets = bug === "null-ref" ? [BUG_IDS, FLOOR1] : [BUG_IDS];
        for (const cands of sets) {
          let s = battleWith(bug, seed, cands);
          for (let i = 0; i < 3; i++) {
            if (s.player.cpu === 0) s = apply(s, { t: "endTurn" });
            s = apply(s, { t: "skill", id: "reproduce" });
            expect(s.lastError).toBeNull();
          }
          expect(consistent(s)).toEqual([bug]);
        }
      }
    },
  );

  it.each(["null-ref", "race", "leak", "infinite-loop"] as const)(
    "%s: read-log は正解を消さない（シード200個）",
    (bug) => {
      for (const seed of SEEDS) {
        let s = battleWith(bug, seed);
        while (s.battle!.candidates.length > 1) {
          if (s.player.cpu === 0) s = apply(s, { t: "endTurn" });
          s = apply(s, { t: "skill", id: "read-log" });
          expect(s.lastError).toBeNull();
        }
        expect(s.battle!.candidates).toEqual([bug]);
      }
    },
  );
});

describe("legalActions（null-ref・race・leak・infinite-loop）", () => {
  function key(a: Action): string {
    return JSON.stringify(a);
  }

  it.each(["null-ref", "race", "leak", "infinite-loop"] as const)(
    "%s: 返した手はすべて lastError にならず、外した手はすべて lastError になる",
    (bug) => {
      for (const seed of SEEDS.slice(0, 50)) {
        let s = battleWith(bug, seed);
        for (let step = 0; step < 12 && s.phase === "battle"; step++) {
          const legal = legalActions(s);
          const legalKeys = new Set(legal.map(key));
          const every: Action[] = [
            { t: "endTurn" },
            { t: "abandon" },
            { t: "move", room: "r0" },
            ...s.player.skills.flatMap((id): Action[] =>
              id === "patch"
                ? BUG_IDS.map((arg) => ({ t: "skill", id, arg }))
                : [{ t: "skill", id }],
            ),
          ];
          for (const a of every) {
            const r = apply(s, a);
            expect(r.lastError === null, `${seed} ${key(a)}`).toBe(legalKeys.has(key(a)));
            if (r.lastError !== null) {
              // 無意味な操作は状態を変えない（CPU も減らない）
              expect({ ...r, lastError: null, events: [] }).toEqual({
                ...s,
                lastError: null,
                events: [],
              });
            }
          }
          // 消えた候補は patch で選べない
          for (const a of legal) {
            if (a.t === "skill" && a.id === "patch") expect(s.battle!.candidates).toContain(a.arg);
          }
          const pick = legal.filter(
            (a) => a.t !== "abandon" && !(a.t === "skill" && a.id === "patch"),
          );
          s = apply(s, pick[(step * 7 + seed.length) % pick.length]!);
        }
      }
    },
  );
});
