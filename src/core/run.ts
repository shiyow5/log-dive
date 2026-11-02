/**
 * 1ラン分の状態（RunState）と操作（Action）。
 *
 * apply(state, action) → state の Reducer で進める（src/core/replay.ts に乗せる）。
 * 不正な操作は例外にせず、状態を変えずに lastError を立てる（UI がメッセージを出す）。
 *
 * この PR（dev-plan-v3 §3 S1）は型だけ。apply() は S2（A-run-battle）で入る。
 */
import type { BugId, SkillId } from "./data";
import type { RngState } from "./rng";

// ---- Action ----

export type Action =
  /** 隣の部屋へ移動する（マップ画面のみ）。 */
  | { readonly t: "move"; readonly room: string }
  /** スキルを使う（戦闘中のみ）。patch は arg に種類を指定する。 */
  | { readonly t: "skill"; readonly id: SkillId; readonly arg?: BugId }
  /** ターン終了 → バグが行動する（戦闘中のみ）。 */
  | { readonly t: "endTurn" }
  /** 宝箱のスキルを受け取る（後の PR で使う）。 */
  | { readonly t: "loot"; readonly pick: SkillId }
  /** ランをやめてリザルトへ。 */
  | { readonly t: "abandon" };

// ---- 状態 ----

/** won=クリア / lost=HP0 / abandoned=やめた。この3つではどの操作も lastError になる。 */
export type RunPhase = "map" | "battle" | "won" | "lost" | "abandoned";

export interface PlayerState {
  readonly hp: number;
  readonly maxHp: number;
  /** このターンに残っている CPU。 */
  readonly cpu: number;
  /** 毎ターンの CPU（持ち越しなし。infinite-loop で次ターンだけ減る）。 */
  readonly cpuMax: number;
  readonly skills: readonly SkillId[];
}

export type RoomContent =
  | { readonly kind: "empty" }
  | { readonly kind: "bug"; readonly bugs: readonly BugId[]; readonly boss?: boolean }
  | { readonly kind: "chest"; readonly skill: SkillId }
  | { readonly kind: "stairs" };

export interface RoomState {
  readonly id: string;
  /** 現在地ラベル（例: "auth.login()"）。 */
  readonly label: string;
  /** 小グリッド上の位置（ミニマップ用）。 */
  readonly x: number;
  readonly y: number;
  readonly neighbors: readonly string[];
  readonly visited: boolean;
  readonly content: RoomContent;
}

export interface FloorState {
  /** 1 始まり。 */
  readonly number: number;
  readonly rooms: readonly RoomState[];
}

/** バグの次の行動の予告（画面に出す）。 */
export interface BugIntent {
  /** 予告ダメージ（off-by-one は実際にはこれより多い）。 */
  readonly damage: number;
  /** null-ref の大ダメージまでの残りターン（0 で次が大ダメージ）。無い種類は undefined。 */
  readonly countdown?: number;
}

export interface BattleState {
  readonly roomId: string;
  /** 正体（画面には出さない。リザルトと演出用）。 */
  readonly bug: BugId;
  readonly boss: boolean;
  readonly hp: number;
  readonly maxHp: number;
  /** ボスはあと何回正解パッチが要るか（通常バグは 1）。 */
  readonly patchesLeft: number;
  /** 残っている候補（read-log / bisect で減る。patch で選べるのはこの中だけ）。 */
  readonly candidates: readonly BugId[];
  /** 公開済みの症状（文）。公開順はシードで決まる。 */
  readonly symptoms: readonly string[];
  /** まだ公開していない症状（公開順）。UI には出さない。 */
  readonly hiddenSymptoms: readonly string[];
  /** reproduce 済みか（未再現のバグに patch は効かない）。 */
  readonly reproduced: boolean;
  readonly intent: BugIntent;
  /** 戦闘内のターン数（1 始まり）。 */
  readonly turn: number;
  /** 戦闘用の乱数（`battle:${seed}:${n}` から作る）。 */
  readonly rng: RngState;
}

export interface RunStats {
  readonly bugsClosed: number;
  readonly turns: number;
  readonly degrades: number;
}

export type RunErrorCode =
  | "run_over"
  | "not_in_battle"
  | "in_battle"
  | "unknown_room"
  | "not_adjacent"
  | "skill_not_owned"
  | "not_enough_cpu"
  | "not_reproduced"
  | "not_a_candidate"
  | "missing_arg"
  | "nothing_to_reveal"
  | "too_few_candidates"
  | "no_loot"
  | "already_owned";

export interface RunError {
  readonly code: RunErrorCode;
  /** そのまま画面に出せる日本語。 */
  readonly message: string;
}

/** 直前の apply で起きたこと（演出キュー用。毎回作り直す）。 */
export type RunEvent =
  | { readonly t: "moved"; readonly room: string }
  | { readonly t: "battleStart"; readonly room: string }
  | { readonly t: "symptom"; readonly text: string }
  | { readonly t: "candidateRemoved"; readonly bug: BugId }
  | { readonly t: "bugDamaged"; readonly amount: number }
  | { readonly t: "degrade" }
  | { readonly t: "bugClosed"; readonly bug: BugId }
  | { readonly t: "playerDamaged"; readonly amount: number }
  | { readonly t: "runEnd"; readonly phase: "won" | "lost" | "abandoned" };

export interface RunState {
  /** ルール＋data のバージョン（Replay.version と同じ値）。 */
  readonly version: number;
  readonly seed: string;
  readonly phase: RunPhase;
  readonly floor: FloorState;
  readonly roomId: string;
  readonly player: PlayerState;
  /** 戦闘中だけ入る。 */
  readonly battle: BattleState | null;
  /** 階生成用の乱数（`floor:${seed}:${n}` から作る）。 */
  readonly floorRng: RngState;
  /** これまでに始めた戦闘の数（battle 乱数の n に使う）。 */
  readonly battleCount: number;
  /** デグレで次の階に増えるバグ（最大2）。 */
  readonly reinforcements: number;
  readonly stats: RunStats;
  /** 直前の操作が不正だったときだけ入る。成功した操作で null に戻る。 */
  readonly lastError: RunError | null;
  readonly events: readonly RunEvent[];
}
