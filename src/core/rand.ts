/**
 * RngState を「値と次の状態を返す」純粋関数で使うための小道具。
 * RunState に RngState を持たせ、apply の中ではこれだけを使う（状態を外に持たない）。
 */
import { Rng, type RngState } from "./rng";

/** [min, max] の整数と、次の状態。 */
export function randInt(state: RngState, min: number, max: number): [number, RngState] {
  const r = new Rng(state);
  const v = r.int(min, max);
  return [v, r.state];
}

/** 配列から1つ選んだ値と、次の状態。 */
export function randPick<T>(state: RngState, items: readonly T[]): [T, RngState] {
  const r = new Rng(state);
  const v = r.pick(items);
  return [v, r.state];
}

/** シャッフルした新しい配列と、次の状態。 */
export function randShuffle<T>(state: RngState, items: readonly T[]): [T[], RngState] {
  const r = new Rng(state);
  const v = r.shuffle(items);
  return [v, r.state];
}
