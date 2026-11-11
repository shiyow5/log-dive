/**
 * 1ラン分の状態（RunState）と操作（Action）。
 *
 * apply(state, action) → state の Reducer で進める（src/core/replay.ts に乗せる）。
 * 不正な操作は例外にせず、状態を変えずに lastError を立てる（UI がメッセージを出す）。
 *
 * 階は generateFloor(seed, n) で作る（Issue #35）。バグを全部閉じると階段が開き、階段の部屋に入ると次の階へ。
 * 最後の階はボス（HP30・正解パッチ2回）。ボスを閉じたら won。
 */
import { bugTurn, isRunError, startBattle, useSkill } from "./battle";
import { bossDef, loadGameData, type BugId, type GameData, type SkillId } from "./data";
import { START_ROOM, candidatesForFloor, floorCount, generateFloor } from "./floor";
import type { Reducer } from "./replay";
import { seedFrom, type RngState } from "./rng";

// ---- Action ----

export type Action =
  /** 隣の部屋へ移動する（マップ画面のみ）。 */
  | { readonly t: "move"; readonly room: string }
  /** スキルを使う（戦闘中のみ）。patch は arg に種類を指定する。 */
  | { readonly t: "skill"; readonly id: SkillId; readonly arg?: BugId }
  /** ターン終了 → バグが行動する（戦闘中のみ）。 */
  | { readonly t: "endTurn" }
  /** 今いる部屋の宝箱のスキルを受け取る（マップ画面のみ）。 */
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
  /** 倒すのに必要な正しいパッチの総数（通常戦闘は1）。 */
  readonly patchesTotal: number;
  /** 残っている候補（read-log / bisect で減る。patch で選べるのはこの中だけ）。 */
  readonly candidates: readonly BugId[];
  /** 公開済みの症状（文）。公開順はシードで決まる。 */
  readonly symptoms: readonly string[];
  /** まだ公開していない症状（公開順）。UI には出さない。 */
  readonly hiddenSymptoms: readonly string[];
  /** reproduce 済みか（未再現のバグに patch は効かない）。 */
  readonly reproduced: boolean;
  /** breakpoint 済みで、次のバグ行動を1回止めるか。 */
  readonly halted: boolean;
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
  | "already_owned"
  | "already_halted";

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
  /** 症状が残っていない状態で再現だけ済ませた（新しい症状はない）。 */
  | { readonly t: "reproduced" }
  | { readonly t: "candidateRemoved"; readonly bug: BugId }
  | {
      readonly t: "bugDamaged";
      readonly amount: number;
      /** ダメージの由来。patch のときだけ patchNo（何回目の正しいパッチか、1始まり）が付く。 */
      readonly by: "patch" | "hotfix";
      readonly patchNo?: number;
    }
  | { readonly t: "degrade" }
  /** breakpoint を張った（次のバグ行動を止める）。 */
  | { readonly t: "halted" }
  /** breakpoint でバグの行動が止まったターン終了。 */
  | { readonly t: "bugHaltedTurn" }
  | { readonly t: "bugClosed"; readonly bug: BugId }
  /** その階のバグを全部閉じて階段が開いた。 */
  | { readonly t: "stairsOpened" }
  /** 階段で次の階へ降りた（floor は新しい階の番号）。 */
  | { readonly t: "descended"; readonly floor: number }
  /** 宝箱からスキルを受け取った。 */
  | { readonly t: "looted"; readonly skill: SkillId }
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
  /**
   * この階で起きたデグレの数（最大2）。次の階の増援になり、降りたら 0 に戻る。
   * 最後の階ではボスの HP 補正にも使う（v0.2 §8: 3階でデグレしたら +5、上限35）。
   */
  readonly reinforcements: number;
  readonly stats: RunStats;
  /** 直前の操作が不正だったときだけ入る。成功した操作で null に戻る。 */
  readonly lastError: RunError | null;
  readonly events: readonly RunEvent[];
}

// ---- ルール ----

/** ルール＋data のバージョン。ルールか data を変えたら上げる（v0.2 決定10）。 */
export const RULES_VERSION = 4;

/** デグレで次の階に増えるバグの上限（v0.2 決定2）。 */
export const MAX_REINFORCEMENTS = 2;

/** 新しいランを始める。 */
export function initRun(seed: string, data: GameData = loadGameData()): RunState {
  const starters = data.skills.skills.filter((s) => s.starter).map((s) => s.id);
  return {
    version: RULES_VERSION,
    seed,
    phase: "map",
    floor: generateFloor(seed, 1),
    roomId: START_ROOM,
    player: {
      hp: data.player.hp,
      maxHp: data.player.hp,
      cpu: data.player.cpuPerTurn,
      cpuMax: data.player.cpuPerTurn,
      skills: starters,
    },
    battle: null,
    floorRng: seedFrom(`floor:${seed}:1`),
    battleCount: 0,
    reinforcements: 0,
    stats: { bugsClosed: 0, turns: 0, degrades: 0 },
    lastError: null,
    events: [],
  };
}

function fail(state: RunState, code: RunErrorCode, message: string): RunState {
  // 不正な操作: 状態は変えず、lastError だけ立てる
  return { ...state, lastError: { code, message }, events: [] };
}

function updateRoom(floor: FloorState, id: string, f: (r: RoomState) => RoomState): FloorState {
  return { ...floor, rooms: floor.rooms.map((r) => (r.id === id ? f(r) : r)) };
}

/** その階のバグが全部閉じていて、階段で次の階へ進めるか（画面の表示用）。 */
export function stairsOpen(state: RunState): boolean {
  return state.floor.number < floorCount() && !hasBugsLeft(state.floor);
}

function hasBugsLeft(floor: FloorState): boolean {
  return floor.rooms.some((r) => r.content.kind === "bug" && r.content.bugs.length > 0);
}

/** 部屋に残っている先頭のバグと戦闘を始める（いなければ map のまま）。 */
function enterRoom(state: RunState, data: GameData, events: RunEvent[]): RunState {
  const room = state.floor.rooms.find((r) => r.id === state.roomId);
  if (!room || room.content.kind !== "bug") return state;
  const bug = room.content.bugs[0];
  if (bug === undefined) return state;
  const battle = startBattle({
    data,
    runSeed: state.seed,
    n: state.battleCount,
    roomId: room.id,
    bug,
    candidates: candidatesForFloor(state.floor.number),
    boss: room.content.boss === true,
    bossHpBonus: state.reinforcements,
  });
  events.push({ t: "battleStart", room: room.id });
  return {
    ...state,
    phase: "battle",
    battle,
    battleCount: state.battleCount + 1,
    player: { ...state.player, cpu: state.player.cpuMax },
  };
}

function applyMove(state: RunState, data: GameData, room: string): RunState {
  if (state.phase === "battle") return fail(state, "in_battle", "戦闘中は移動できません");
  const target = state.floor.rooms.find((r) => r.id === room);
  if (!target) return fail(state, "unknown_room", "その部屋はありません");
  const here = state.floor.rooms.find((r) => r.id === state.roomId);
  if (!here?.neighbors.includes(room)) return fail(state, "not_adjacent", "隣の部屋ではありません");

  const events: RunEvent[] = [{ t: "moved", room }];
  const moved: RunState = {
    ...state,
    roomId: room,
    floor: updateRoom(state.floor, room, (r) => ({ ...r, visited: true })),
  };
  if (target.content.kind === "stairs" && !hasBugsLeft(state.floor)) {
    return {
      ...descend(moved),
      lastError: null,
      events: [...events, { t: "descended", floor: state.floor.number + 1 }],
    };
  }
  const next = enterRoom(moved, data, events);
  return { ...next, lastError: null, events };
}

/** 次の階へ。増援はこの階のデグレ数で、使ったら 0 に戻す。 */
function descend(state: RunState): RunState {
  const n = state.floor.number + 1;
  return {
    ...state,
    floor: generateFloor(state.seed, n, { reinforcements: state.reinforcements }),
    roomId: START_ROOM,
    floorRng: seedFrom(`floor:${state.seed}:${n}`),
    reinforcements: 0,
  };
}

function applyLoot(state: RunState, pick: SkillId): RunState {
  if (state.phase === "battle") return fail(state, "in_battle", "戦闘中は宝箱を開けられません");
  const here = state.floor.rooms.find((r) => r.id === state.roomId);
  if (here?.content.kind !== "chest" || here.content.skill !== pick) {
    return fail(state, "no_loot", "ここに宝箱はありません");
  }
  if (state.player.skills.includes(pick)) {
    return fail(state, "already_owned", "そのスキルはもう持っています");
  }
  return {
    ...state,
    player: { ...state.player, skills: [...state.player.skills, pick] },
    floor: updateRoom(state.floor, here.id, (r) => ({ ...r, content: { kind: "empty" } })),
    lastError: null,
    events: [{ t: "looted", skill: pick }],
  };
}

/** バグを倒したあとの後片付け（部屋から消す・クリア判定・同じ部屋の次のバグ）。 */
function closeBug(
  state: RunState,
  data: GameData,
  battle: BattleState,
  events: RunEvent[],
): RunState {
  events.push({ t: "bugClosed", bug: battle.bug });
  const floor = updateRoom(state.floor, battle.roomId, (r) => {
    if (r.content.kind !== "bug") return r;
    const bugs = r.content.bugs.slice(1);
    return { ...r, content: bugs.length > 0 ? { ...r.content, bugs } : { kind: "empty" } };
  });
  const closed: RunState = {
    ...state,
    phase: "map",
    battle: null,
    // CPU は戦闘中だけの行動力。撃破後のマップ画面に戦闘の残り（例 1/3）を出さないよう上限に戻す
    player: { ...state.player, cpu: state.player.cpuMax },
    floor,
    stats: { ...state.stats, bugsClosed: state.stats.bugsClosed + 1 },
  };
  if (battle.boss) {
    events.push({ t: "runEnd", phase: "won" });
    return { ...closed, phase: "won" };
  }
  if (!hasBugsLeft(floor) && state.floor.number < floorCount()) {
    events.push({ t: "stairsOpened" });
    return closed;
  }
  return enterRoom(closed, data, events);
}

function applySkill(
  state: RunState,
  data: GameData,
  id: SkillId,
  arg: BugId | undefined,
): RunState {
  const battle = state.battle;
  if (state.phase !== "battle" || !battle) {
    return fail(state, "not_in_battle", "スキルは戦闘中だけ使えます");
  }
  const r = useSkill(data, battle, state.player, id, arg);
  if (isRunError(r)) return fail(state, r.code, r.message);

  const events: RunEvent[] = [...r.events];
  let next: RunState = { ...state, battle: r.battle, player: r.player };
  if (r.degraded) {
    if (r.battle.boss) next = { ...next, battle: bossDegrade(data, r.battle) };
    next = {
      ...next,
      reinforcements: Math.min(MAX_REINFORCEMENTS, next.reinforcements + 1),
      stats: { ...next.stats, degrades: next.stats.degrades + 1 },
    };
  }
  // ボスは HP が 0 でも、正解パッチを必要な回数当てるまでは倒れない
  const b = next.battle as BattleState;
  if (b.hp <= 0 && (!b.boss || b.patchesLeft <= 0)) next = closeBug(next, data, b, events);
  return { ...next, lastError: null, events };
}

/** ボス戦でのデグレ: 最大 HP を補正分だけ上げて（上限あり）全回復する。 */
function bossDegrade(data: GameData, battle: BattleState): BattleState {
  const boss = bossDef(data);
  const maxHp = Math.min(battle.maxHp + boss.degradeHpBonus, boss.hpCap);
  return { ...battle, maxHp, hp: maxHp };
}

function applyEndTurn(state: RunState, data: GameData): RunState {
  const battle = state.battle;
  if (state.phase !== "battle" || !battle) {
    return fail(state, "not_in_battle", "ターン終了は戦闘中だけです");
  }
  const r = bugTurn(data, battle, state.player);
  const events: RunEvent[] = [...r.events];
  let next: RunState = {
    ...state,
    battle: r.battle,
    player: r.player,
    stats: { ...state.stats, turns: state.stats.turns + 1 },
  };
  if (r.player.hp <= 0) {
    events.push({ t: "runEnd", phase: "lost" });
    next = { ...next, phase: "lost" };
  }
  return { ...next, lastError: null, events };
}

function isOver(phase: RunPhase): boolean {
  return phase === "won" || phase === "lost" || phase === "abandoned";
}

/**
 * 1手進める。入力の state は変更しない。
 * 不正な操作は例外にせず、状態はそのままで lastError を立てて返す。
 */
export function apply(state: RunState, action: Action, data: GameData = loadGameData()): RunState {
  if (isOver(state.phase)) return fail(state, "run_over", "ランは終わっています");
  switch (action.t) {
    case "move":
      return applyMove(state, data, action.room);
    case "skill":
      return applySkill(state, data, action.id, action.arg);
    case "endTurn":
      return applyEndTurn(state, data);
    case "loot":
      return applyLoot(state, action.pick);
    case "abandon":
      return {
        ...state,
        phase: "abandoned",
        lastError: null,
        events: [{ t: "runEnd", phase: "abandoned" }],
      };
  }
}

/** 今の状態で lastError にならない操作の一覧（BOT・ボタンの有効/無効に使う）。 */
export function legalActions(state: RunState, data: GameData = loadGameData()): Action[] {
  if (isOver(state.phase)) return [];
  const all: Action[] = [{ t: "abandon" }];
  if (state.phase === "map") {
    const here = state.floor.rooms.find((r) => r.id === state.roomId);
    for (const room of here?.neighbors ?? []) all.push({ t: "move", room });
    if (here?.content.kind === "chest") all.push({ t: "loot", pick: here.content.skill });
  }
  if (state.phase === "battle" && state.battle) {
    all.push({ t: "endTurn" });
    for (const id of state.player.skills) {
      if (id === "patch") {
        for (const c of state.battle.candidates) all.push({ t: "skill", id, arg: c });
      } else {
        all.push({ t: "skill", id });
      }
    }
  }
  return all.filter((a) => apply(state, a, data).lastError === null);
}

/** src/core/replay.ts の runReplay に渡す Reducer。 */
export const runReducer: Reducer<RunState, Action> = {
  init: (seed) => initRun(seed),
  apply: (state, action) => apply(state, action),
};
