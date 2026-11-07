import { describe, expect, it } from "vitest";
import { runReplay, type Reducer } from "../../src/core/replay";
import {
  botSeedCount,
  DEFAULT_BOT_SEEDS,
  formatBotFailures,
  runBot,
  runBotSeeds,
  type BotFailure,
  type BotGame,
} from "./bot";
import { toyIsTerminal, toyLegalActions, toyReducer, type ToyAction, type ToyState } from "./toy";
import { runReducer, legalActions, type Action, type RunState } from "../../src/core/run";

const hpNonNegative = (s: ToyState): string | null =>
  s.hp >= 0 && s.bugHp >= 0 ? null : `HP がマイナス: hp=${s.hp} bugHp=${s.bugHp}`;

const toyGame: BotGame<ToyState, ToyAction> = {
  name: "toy",
  version: 1,
  reducer: toyReducer,
  legalActions: toyLegalActions,
  isTerminal: toyIsTerminal,
  invariants: [hpNonNegative],
};

/** toy の reducer の一部だけ差し替えた「わざと壊した」ゲーム */
const broken = (
  apply: Reducer<ToyState, ToyAction>["apply"],
  extra: Partial<BotGame<ToyState, ToyAction>> = {},
): BotGame<ToyState, ToyAction> => ({
  ...toyGame,
  reducer: { init: toyReducer.init, apply },
  ...extra,
});

const MAX_TURNS = 100;

describe("BOT 足場（おもちゃ reducer）", () => {
  it(`正しいゲームなら QA_BOT_SEEDS 本（既定 ${DEFAULT_BOT_SEEDS}）すべて例外0・上限内で終わる`, () => {
    const res = runBotSeeds(toyGame, { count: botSeedCount(), maxTurns: MAX_TURNS });
    expect(res.failures, formatBotFailures(res.failures)).toEqual([]);
    expect(res.runs).toBe(botSeedCount());
    expect(res.maxTurnsSeen).toBeGreaterThan(0);
    expect(res.maxTurnsSeen).toBeLessThanOrEqual(MAX_TURNS);
  });

  it("同じ seed なら同じ行動列（BOT 自体も決定的）", () => {
    const a = runBot(toyGame, { seed: "s-1", maxTurns: MAX_TURNS });
    const b = runBot(toyGame, { seed: "s-1", maxTurns: MAX_TURNS });
    expect(a).toEqual(b);
    const c = runBot(toyGame, { seed: "s-2", maxTurns: MAX_TURNS });
    expect(c.replay.seed).toBe("s-2");
  });

  it("成功時の Replay を再生すると終局の state になる", () => {
    const r = runBot(toyGame, { seed: "s-3", maxTurns: MAX_TURNS });
    expect(r.ok).toBe(true);
    expect(toyIsTerminal(runReplay(toyReducer, r.replay))).toBe(true);
    expect(r.replay.actions.length).toBe(r.ok ? r.turns : -1);
  });

  it("HP がマイナスになるバグを invariant で捕まえ、seed と Replay を出す", () => {
    const noClamp = broken((s, a) => {
      const n = toyReducer.apply(s, a);
      return n.hp === 0 ? { ...n, hp: -1 } : n;
    });
    const res = runBotSeeds(noClamp, { count: 20, maxTurns: MAX_TURNS });
    expect(res.failures.length).toBeGreaterThan(0);
    const f = res.failures[0] as BotFailure<ToyAction>;
    expect(f.kind).toBe("invariant");
    expect(f.message).toMatch(/HP がマイナス/);
    expect(f.seed).toMatch(/^qa-bot-\d+$/);
    // 出した Replay を再生すると同じ壊れた state になる（＝そのまま再現手順になる）
    expect(hpNonNegative(runReplay(noClamp.reducer, f.replay))).not.toBeNull();
    expect(f.replay.actions.length).toBe(f.turn);
  });

  it("apply が投げた例外を落ちずに記録する（落ちた手まで Replay に入る）", () => {
    const throwing = broken((s, a) => {
      if (a === "patch" && s.turn >= 2) throw new TypeError("boom");
      return toyReducer.apply(s, a);
    });
    const res = runBotSeeds(throwing, { count: 20, maxTurns: MAX_TURNS });
    const f = res.failures[0] as BotFailure<ToyAction>;
    expect(f.kind).toBe("exception");
    expect(f.message).toMatch(/TypeError: boom/);
    expect(f.replay.actions.at(-1)).toBe("patch");
    expect(() => runReplay(throwing.reducer, f.replay)).toThrow("boom");
  });

  it("init が投げても turn=0 の exception として返す", () => {
    const g: BotGame<ToyState, ToyAction> = {
      ...toyGame,
      reducer: {
        init: () => {
          throw new Error("no data");
        },
        apply: toyReducer.apply,
      },
    };
    const r = runBot(g, { seed: "x", maxTurns: 5 });
    expect(r).toMatchObject({ ok: false, kind: "exception", turn: 0 });
  });

  it("終わらないゲームは上限ターンで turn-limit として止まる（無限ループしない）", () => {
    const immortal = broken((s, a) => ({
      ...toyReducer.apply({ ...s, hp: 10 }, a),
      hp: 10,
      bugHp: 6,
    }));
    const r = runBot(immortal, { seed: "x", maxTurns: 50 });
    expect(r).toMatchObject({ ok: false, kind: "turn-limit", turn: 50 });
    expect(r.replay.actions).toHaveLength(50);
  });

  it("ちょうど上限ターンで終局したら成功", () => {
    const g: BotGame<{ n: number }, "tick"> = {
      name: "count",
      version: 1,
      reducer: { init: () => ({ n: 0 }), apply: (s) => ({ n: s.n + 1 }) },
      legalActions: () => ["tick"],
      isTerminal: (s) => s.n >= 5,
    };
    expect(runBot(g, { seed: "x", maxTurns: 5 })).toMatchObject({ ok: true, turns: 5 });
    expect(runBot(g, { seed: "x", maxTurns: 4 })).toMatchObject({ ok: false, kind: "turn-limit" });
  });

  it("終局でないのに合法手が0なら no-legal-action", () => {
    const g = {
      ...toyGame,
      legalActions: (s: ToyState) => (s.turn >= 1 ? [] : toyLegalActions(s)),
    };
    expect(runBot(g, { seed: "x", maxTurns: 10 })).toMatchObject({
      ok: false,
      kind: "no-legal-action",
      turn: 2,
    });
  });

  it("maxTurns が正の整数でなければ設定ミスとして投げる", () => {
    expect(() => runBot(toyGame, { seed: "x", maxTurns: 0 })).toThrow(RangeError);
    expect(() => runBot(toyGame, { seed: "x", maxTurns: 1.5 })).toThrow(RangeError);
  });

  it("QA_BOT_SEEDS: 未設定・空は既定、正の整数はその値、それ以外は投げる（0本で緑にしない）", () => {
    expect(botSeedCount({})).toBe(200);
    expect(botSeedCount({ QA_BOT_SEEDS: "" })).toBe(200);
    expect(botSeedCount({ QA_BOT_SEEDS: " 1000 " })).toBe(1000);
    for (const bad of ["0", "-1", "abc", "1e3", "2.5", "99999999999999999999"]) {
      expect(() => botSeedCount({ QA_BOT_SEEDS: bad }), bad).toThrow(RangeError);
    }
  });

  it("formatBotFailures は seed・Replay JSON を含み、件数を丸める", () => {
    const f: BotFailure<ToyAction> = {
      ok: false,
      kind: "invariant",
      message: "m",
      seed: "qa-bot-7",
      turn: 1,
      replay: { game: "toy", version: 1, seed: "qa-bot-7", actions: ["wait"] },
    };
    const text = formatBotFailures([f, f, f], 2);
    expect(text).toContain("seed=qa-bot-7");
    expect(text).toContain('"actions":["wait"]');
    expect(text).toContain("ほか 1 件");
  });
});

describe("LD-15 本物の BOT（Log Dive の reducer 待ち）", () => {
  it("縦切り（1部屋）: 200 seed で例外0・上限ターンで必ず終わる・HP>=0", () => {
    const hpNonNegative = (s: RunState): string | null =>
      s.player.hp >= 0 ? null : `HP がマイナス: ${s.player.hp}`;
    const cpuNonNegative = (s: RunState): string | null =>
      s.player.cpu >= 0 ? null : `CPU がマイナス: ${s.player.cpu}`;
    const runGame: BotGame<RunState, Action> = {
      name: "log-dive",
      version: 4,
      reducer: runReducer,
      legalActions: (state) => legalActions(state),
      isTerminal: (state) => state.phase === "won" || state.phase === "lost" || state.phase === "abandoned",
      invariants: [hpNonNegative, cpuNonNegative],
    };
    const res = runBotSeeds(runGame, { count: botSeedCount(), maxTurns: 1000 });
    expect(res.failures, formatBotFailures(res.failures)).toEqual([]);
    expect(res.runs).toBe(botSeedCount());
    expect(res.maxTurnsSeen).toBeGreaterThan(0);
  });

  it("不変条件を足す: CPU が 0 未満にならない（LD-04 未完成）", () => {
    const cpuNonNegative = (s: RunState): string | null =>
      s.player.cpu >= 0 ? null : `CPU がマイナス: ${s.player.cpu}`;
    // NOTE: "不正な手で state が変わらない" invariant は未実装。
    // lastError が立ってる手を replay して state が変わらないことを確認する予定。
    const runGame: BotGame<RunState, Action> = {
      name: "log-dive",
      version: 4,
      reducer: runReducer,
      legalActions: (state) => legalActions(state),
      isTerminal: (state) => state.phase === "won" || state.phase === "lost" || state.phase === "abandoned",
      invariants: [cpuNonNegative],
    };
    const res = runBotSeeds(runGame, { count: 200, maxTurns: 1000 });
    expect(res.failures, formatBotFailures(res.failures)).toEqual([]);
    expect(res.runs).toBe(200);
    expect(res.maxTurnsSeen).toBeGreaterThan(0);
  });
});
