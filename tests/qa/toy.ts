import type { Reducer } from "../../src/core/replay";
import { Rng, type RngState } from "../../src/core/rng";

/**
 * 足場を動かすための「おもちゃ」のゲーム（本物の Log Dive ではない）。
 * プレイヤー HP 10 と バグ HP 6 が殴り合う。バグは毎ターン 0〜3 ダメージ（seed で決まる）。
 * 本物の reducer が入ったら、golden / bot のテストはそちらに当てる。
 */
export type ToyAction = "patch" | "reproduce" | "wait";

export interface ToyState {
  readonly rng: RngState;
  readonly hp: number;
  readonly bugHp: number;
  readonly turn: number;
  readonly reproduced: boolean;
  readonly result: "playing" | "win" | "lose";
}

export const TOY_ACTIONS: readonly ToyAction[] = ["patch", "reproduce", "wait"];

export const toyReducer: Reducer<ToyState, ToyAction> = {
  init: (seed) => ({
    rng: new Rng(seed).state,
    hp: 10,
    bugHp: 6,
    turn: 0,
    reproduced: false,
    result: "playing",
  }),
  apply: (s, a) => {
    if (s.result !== "playing") throw new Error(`toy: action after end (${a})`);
    // Rng は state にコピーして持つ（共有インスタンスを使い回すとセーブ→ロードでずれる: LD-02）
    const rng = new Rng(s.rng);
    let bugHp = s.bugHp;
    let reproduced = s.reproduced;
    if (a === "reproduce") reproduced = true;
    if (a === "patch" && reproduced) bugHp = Math.max(0, bugHp - 3);
    const dmg = rng.int(0, 3);
    const hp = Math.max(0, s.hp - dmg);
    const result = bugHp === 0 ? "win" : hp === 0 ? "lose" : "playing";
    return { rng: rng.state, hp, bugHp, turn: s.turn + 1, reproduced, result };
  },
};

export const toyLegalActions = (s: ToyState): readonly ToyAction[] =>
  s.result === "playing" ? TOY_ACTIONS : [];

export const toyIsTerminal = (s: ToyState): boolean => s.result !== "playing";
