/**
 * リプレイ = 「シード + 入力列」。ルールが決定的なら、これだけで同じ結果を再生できる。
 * バグ報告にはこの JSON を添付してもらえば再現できる。
 */
export interface Replay<A> {
  readonly game: string;
  readonly version: number;
  readonly seed: string;
  readonly actions: readonly A[];
}

export interface Reducer<S, A> {
  init(seed: string): S;
  apply(state: S, action: A): S;
}

export function runReplay<S, A>(reducer: Reducer<S, A>, replay: Replay<A>): S {
  let state = reducer.init(replay.seed);
  for (const action of replay.actions) state = reducer.apply(state, action);
  return state;
}

export class ReplayRecorder<A> {
  private readonly actions: A[] = [];
  constructor(
    private readonly game: string,
    private readonly version: number,
    private readonly seed: string,
  ) {}
  record(action: A): void {
    this.actions.push(action);
  }
  toReplay(): Replay<A> {
    return { game: this.game, version: this.version, seed: this.seed, actions: this.actions.slice() };
  }
}
