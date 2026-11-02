/**
 * 画面（src/scenes）とルール（RunState / apply）のつなぎ目。
 *
 * 画面はここ経由でしか RunState に触らない。K3（A-wire）では下の import を
 * スタブから src/core/run.ts に差し替えるだけで済むようにしてある。
 */
import { apply as stubApply, createRun as stubCreateRun } from "./stub/run-stub";
import type { Action, RunState } from "./stub/run-stub";

export type {
  Action,
  BattleState,
  BugKind,
  Room,
  RunState,
  RunStatus,
  SkillId,
} from "./stub/run-stub";
export { BUG_NAME, SKILL_COST } from "./stub/run-stub";

type Listener = (s: RunState) => void;

let state: RunState | null = null;
const listeners = new Set<Listener>();

/** 新しいランを始める。 */
export function startRun(seed: string): RunState {
  state = stubCreateRun(seed);
  return state;
}

export function current(): RunState {
  if (!state) throw new Error("run has not started");
  return state;
}

export function hasRun(): boolean {
  return state !== null;
}

/** Action を1つ流して、新しい状態を返す。 */
export function dispatch(a: Action): RunState {
  const next = stubApply(current(), a);
  state = next;
  for (const l of listeners) l(next);
  return next;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export type SceneKey = "title" | "map" | "battle" | "result";

/** 状態から「今いるべき画面」を決める。 */
export function sceneFor(s: RunState): SceneKey {
  if (s.status === "battle" || s.battle) return "battle";
  if (s.status === "map") return "map";
  return "result";
}
