/**
 * 画面（src/scenes）とルール（src/core/run.ts）のつなぎ目。
 *
 * 画面はここ経由でしか RunState に触らない。ルールの判断（できる/できない・理由）は
 * すべて core の apply() / legalActions() に任せ、画面側では数値や条件を持たない。
 */
import { bugDef, loadGameData, skillDef, type BugId, type SkillId } from "../core/data";
import { apply, initRun, legalActions } from "../core/run";
import type { Action, RunEvent, RunState } from "../core/run";

export type { BugId, SkillId } from "../core/data";
export type { Action, BattleState, RoomState, RunEvent, RunPhase, RunState } from "../core/run";

type Listener = (s: RunState) => void;

const data = loadGameData();
let state: RunState | null = null;
let lastLog: string | null = null;
const listeners = new Set<Listener>();

/** バグの日本語名（data/bugs.json の name）。 */
export function bugName(id: BugId): string {
  return bugDef(data, id).name;
}

/** スキルの日本語名と CPU（data/skills.json）。 */
export function skillInfo(id: SkillId): { name: string; cpu: number } {
  const d = skillDef(data, id);
  return { name: d.name, cpu: d.cpu };
}

/** 新しいランを始める。 */
export function startRun(seed: string): RunState {
  state = initRun(seed, data);
  lastLog = null;
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
  const next = apply(current(), a, data);
  state = next;
  lastLog = next.lastError ? null : describeEvents(next, next.events);
  for (const l of listeners) l(next);
  return next;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 直前の操作で起きたこと（成功時のログ1行。画面をまたいでも残る）。 */
export function lastLogLine(): string | null {
  return lastLog;
}

function sameAction(a: Action, b: Action): boolean {
  if (a.t !== b.t) return false;
  switch (a.t) {
    case "move":
      return b.t === "move" && a.room === b.room;
    case "skill":
      return b.t === "skill" && a.id === b.id && a.arg === b.arg;
    case "loot":
      return b.t === "loot" && a.pick === b.pick;
    default:
      return true;
  }
}

/** 今の状態で押してよいボタンを判定する道具（legalActions を1回だけ計算する）。 */
export interface Legality {
  /** その操作が lastError にならないか。 */
  can(a: Action): boolean;
  /** 押せない理由（core の lastError.message そのまま）。押せるなら null。 */
  why(a: Action): string | null;
}

export function legality(s: RunState): Legality {
  const legal = legalActions(s, data);
  return {
    can: (a) => legal.some((l) => sameAction(l, a)),
    why: (a) =>
      legal.some((l) => sameAction(l, a)) ? null : (apply(s, a, data).lastError?.message ?? null),
  };
}

/** RunEvent をログ用の日本語1行にする（読み上げにも流す）。 */
export function describeEvents(s: RunState, events: readonly RunEvent[]): string | null {
  const roomLabel = (id: string) => s.floor.rooms.find((r) => r.id === id)?.label ?? id;
  const parts = events.map((e): string => {
    switch (e.t) {
      case "moved":
        return `${roomLabel(e.room)} に移動した`;
      case "battleStart":
        return "バグが出た";
      case "symptom":
        return `再現した。症状「${e.text}」`;
      case "candidateRemoved":
        return `ログから「${bugName(e.bug)}」ではないとわかった`;
      case "bugDamaged":
        return `バグに ${e.amount} ダメージ`;
      case "degrade":
        return "デグレ！ 種類が違った。バグが回復した";
      case "halted":
        return "ブレークポイントを張った。次の行動を止める";
      case "bugHaltedTurn":
        return "ブレークポイントでバグの行動を止めた";
      case "bugClosed":
        return `バグ票を閉じた（${bugName(e.bug)}）`;
      case "stairsOpened":
        return "この階のバグを全部閉じた。階段が開いた";
      case "descended":
        return `階段を降りた（${e.floor}階）`;
      case "looted":
        return `宝箱から「${skillInfo(e.skill).name}」を手に入れた`;
      case "playerDamaged":
        return `バグの攻撃で稼働率 -${e.amount}`;
      case "runEnd":
        return e.phase === "won"
          ? "復旧完了"
          : e.phase === "lost"
            ? "ダウンした"
            : "ランを放棄した";
    }
  });
  return parts.length ? parts.join("。") : null;
}

export type SceneKey = "title" | "map" | "battle" | "result";

/** 状態から「今いるべき画面」を決める。 */
export function sceneFor(s: RunState): SceneKey {
  if (s.phase === "battle") return "battle";
  if (s.phase === "map") return "map";
  return "result";
}
