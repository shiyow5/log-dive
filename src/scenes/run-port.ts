/**
 * 画面（src/scenes）とルール（src/core/run.ts）のつなぎ目。
 *
 * 画面はここ経由でしか RunState に触らない。ルールの判断（できる/できない・理由）は
 * すべて core の apply() / legalActions() に任せ、画面側では数値や条件を持たない。
 */
import { STORY } from "./story-text";
import { bugDef, loadGameData, skillDef, type BugId, type SkillId } from "../core/data";
import {
  apply,
  initRun,
  legalActions,
  stairsOpen,
  type Action,
  type RunEvent,
  type RunState,
} from "../core/run";
export { stairsOpen, apply };

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
  const prev = current();
  const next = apply(prev, a, data);
  state = next;
  lastLog = next.lastError ? null : describeEvents(next, next.events, prev.battle?.maxHp);
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
export function describeEvents(
  s: RunState,
  events: readonly RunEvent[],
  prevMaxHp?: number,
): string | null {
  const roomLabel = (id: string) => s.floor.rooms.find((r) => r.id === id)?.label ?? id;
  const parts = events.map((e): string => {
    switch (e.t) {
      case "moved":
        // ボス登場の2行ログ（fumino v1.0）に「移動した」を足すと32字を超える。ボス部屋では出さない
        if (s.battle?.boss && events.some((x) => x.t === "battleStart")) return "";
        return `${roomLabel(e.room)} に移動した`;
      case "battleStart":
        return s.battle?.boss ? STORY.bossAppear : "バグが出た";
      case "symptom":
        return `再現した。症状「${e.text}」`;
      case "reproduced":
        return "再現できた（新しい症状はない）";
      case "candidateRemoved":
        return `ログから「${bugName(e.bug)}」ではないとわかった`;
      case "bugDamaged": {
        const b = s.battle;
        // ボスは1回目の正しいパッチでは倒れない。実ダメージの次の行に、根が残っていることを添える（#128）。
        // hotfix や2回目以降のパッチでは出さない
        if (e.by === "patch" && e.patchNo === 1 && b?.boss && b.hp > 0 && b.patchesLeft > 0)
          return `バグに ${e.amount} ダメージ\n${STORY.bossPatched}`;
        return `バグに ${e.amount} ダメージ`;
      }
      case "degrade": {
        const b = s.battle;
        // ボスのデグレは最大 HP が上がる。上限で増えなかったときは「(HP +n)」を付けない
        if (b?.boss) {
          const delta = prevMaxHp === undefined ? 0 : Math.max(0, b.maxHp - prevMaxHp);
          return `デグレ！ ${STORY.bossDegrade(delta)}\n${STORY.bossStuckHint}`;
        }
        return "デグレ！ 種類が違った。バグが回復した";
      }
      case "halted":
        return "ブレークポイントを張った。次の行動を止める";
      case "bugHaltedTurn":
        return "ブレークポイントでバグの行動を止めた";
      case "bugClosed":
        // ボスを閉じるとラン終了（won）。ボス専用の一言にする
        if (events.some((x) => x.t === "runEnd" && x.phase === "won")) return STORY.bossDefeated;
        return `バグ票を閉じた（${bugName(e.bug)}）`;
      case "stairsOpened": {
        const stairRoom = s.floor.rooms.find((r) => r.content.kind === "stairs");
        const name = stairRoom ? stairRoom.label : "？";
        return `階段が開いた: ${name}`;
      }
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
  // 「。」で終わる行（物語文言）の次は改行、それ以外は「。」でつなぐ
  const shown = parts.filter((p) => p !== "");
  return shown.length ? shown.reduce((a, p) => a + (a.endsWith("。") ? "\n" : "。") + p) : null;
}

export type SceneKey = "title" | "map" | "battle" | "result";

/** 状態から「今いるべき画面」を決める。 */
export function sceneFor(s: RunState): SceneKey {
  if (s.phase === "battle") return "battle";
  if (s.phase === "map") return "map";
  return "result";
}
