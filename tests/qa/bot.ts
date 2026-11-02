import type { Reducer, Replay } from "../../src/core/replay";
import { Rng } from "../../src/core/rng";

/**
 * LD-15: 合法手ランダム BOT の足場。
 * 「例外0・上限ターンで必ず終わる・HP がマイナスにならない」などの不変条件を毎手の後に確かめる。
 * 失敗したら seed と Replay JSON を出すので、そのまま golden のフィクスチャにできる。
 */
export interface BotGame<S, A> {
  /** Replay.game に入れる名前 */
  readonly name: string;
  readonly version: number;
  readonly reducer: Reducer<S, A>;
  /** その state で打てる手。終局でないのに空なら「手詰まり」として失敗にする */
  legalActions(state: S): readonly A[];
  isTerminal(state: S): boolean;
  /** 不変条件。破れていたらメッセージ、守られていれば null */
  readonly invariants?: ReadonlyArray<(state: S) => string | null>;
}

export type BotFailureKind = "exception" | "invariant" | "no-legal-action" | "turn-limit";

export interface BotFailure<A> {
  readonly ok: false;
  readonly kind: BotFailureKind;
  readonly message: string;
  readonly seed: string;
  /** 失敗した手の番号（0 = init 直後） */
  readonly turn: number;
  /** 失敗までに打った手（exception のときは落ちた手まで含む） */
  readonly replay: Replay<A>;
}

export interface BotSuccess<A> {
  readonly ok: true;
  readonly seed: string;
  readonly turns: number;
  readonly replay: Replay<A>;
}

export type BotResult<A> = BotSuccess<A> | BotFailure<A>;

export interface BotOptions {
  readonly seed: string;
  readonly maxTurns: number;
}

const errMsg = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

/**
 * BOT 1本。ゲームの seed と BOT の手選びの乱数は分ける（`bot:` 接頭辞）。
 * ゲーム側の乱数消費が変わっても BOT の選び方の列は変わらない。
 */
export function runBot<S, A>(game: BotGame<S, A>, opts: BotOptions): BotResult<A> {
  const { seed, maxTurns } = opts;
  if (!Number.isInteger(maxTurns) || maxTurns <= 0) {
    throw new RangeError(`maxTurns must be a positive integer: ${maxTurns}`);
  }
  const pickRng = new Rng(`bot:${seed}`);
  const actions: A[] = [];
  const replay = (): Replay<A> => ({
    game: game.name,
    version: game.version,
    seed,
    actions: actions.slice(),
  });
  const fail = (kind: BotFailureKind, turn: number, message: string): BotFailure<A> => ({
    ok: false,
    kind,
    message,
    seed,
    turn,
    replay: replay(),
  });
  const check = (state: S, turn: number): BotFailure<A> | null => {
    for (const inv of game.invariants ?? []) {
      let msg: string | null;
      try {
        msg = inv(state);
      } catch (e) {
        return fail("exception", turn, `invariant threw: ${errMsg(e)}`);
      }
      if (msg !== null) return fail("invariant", turn, msg);
    }
    return null;
  };

  let state: S;
  try {
    state = game.reducer.init(seed);
  } catch (e) {
    return fail("exception", 0, `init: ${errMsg(e)}`);
  }
  const first = check(state, 0);
  if (first) return first;

  for (let turn = 1; turn <= maxTurns; turn++) {
    let legal: readonly A[];
    try {
      if (game.isTerminal(state)) return { ok: true, seed, turns: turn - 1, replay: replay() };
      legal = game.legalActions(state);
    } catch (e) {
      return fail("exception", turn, `legalActions/isTerminal: ${errMsg(e)}`);
    }
    if (legal.length === 0) return fail("no-legal-action", turn, "終局でないのに合法手が0");
    const action = pickRng.pick(legal);
    actions.push(action);
    try {
      state = game.reducer.apply(state, action);
    } catch (e) {
      return fail("exception", turn, `apply(${JSON.stringify(action)}): ${errMsg(e)}`);
    }
    const bad = check(state, turn);
    if (bad) return bad;
  }
  let endedNow: boolean;
  try {
    endedNow = game.isTerminal(state);
  } catch (e) {
    return fail("exception", maxTurns, `isTerminal: ${errMsg(e)}`);
  }
  if (endedNow) return { ok: true, seed, turns: maxTurns, replay: replay() };
  return fail("turn-limit", maxTurns, `上限 ${maxTurns} ターンで終わらなかった`);
}

export interface BotBatchOptions {
  readonly count: number;
  readonly maxTurns: number;
  /** seed は `${prefix}${i}`。既定 "qa-bot-" */
  readonly prefix?: string;
}

export interface BotBatchResult<A> {
  readonly runs: number;
  readonly failures: readonly BotFailure<A>[];
  readonly maxTurnsSeen: number;
}

export function runBotSeeds<S, A>(game: BotGame<S, A>, opts: BotBatchOptions): BotBatchResult<A> {
  const prefix = opts.prefix ?? "qa-bot-";
  const failures: BotFailure<A>[] = [];
  let maxTurnsSeen = 0;
  for (let i = 0; i < opts.count; i++) {
    const r = runBot(game, { seed: `${prefix}${i}`, maxTurns: opts.maxTurns });
    if (r.ok) maxTurnsSeen = Math.max(maxTurnsSeen, r.turns);
    else failures.push(r);
  }
  return { runs: opts.count, failures, maxTurnsSeen };
}

export const DEFAULT_BOT_SEEDS = 200;

/**
 * 本数は環境変数 QA_BOT_SEEDS（PR 既定 200、nightly 1000: qa-plan-v3 §5-3）。
 * 空・未設定は既定値。数字でない・0以下は設定ミスなので例外にする（黙って 0 本で緑にしない）。
 */
export function botSeedCount(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.QA_BOT_SEEDS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_BOT_SEEDS;
  if (!/^\d+$/.test(raw.trim()))
    throw new RangeError(`QA_BOT_SEEDS must be a positive integer: "${raw}"`);
  const n = Number(raw.trim());
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new RangeError(`QA_BOT_SEEDS must be a positive integer: "${raw}"`);
  }
  return n;
}

/** 失敗の報告。そのまま不具合票と tests/fixtures/replays/ に貼れる形にする。 */
export function formatBotFailures<A>(failures: readonly BotFailure<A>[], limit = 5): string {
  const shown = failures
    .slice(0, limit)
    .map((f) =>
      [
        `[${f.kind}] seed=${f.seed} turn=${f.turn}: ${f.message}`,
        `replay: ${JSON.stringify(f.replay)}`,
      ].join("\n"),
    );
  const rest = failures.length > limit ? `\n…ほか ${failures.length - limit} 件` : "";
  return `BOT failures: ${failures.length}\n${shown.join("\n")}${rest}`;
}
