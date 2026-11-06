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
import {
  START_ROOM,
  candidatesForFloor,
  fixedFloor,
  floorCount,
  generateFloor,
  loadFloors,
} from "./floor";
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
  /** boss 階か（最終階）。 */
  readonly boss: boolean;
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
  | { readonly t: "candidateRemoved"; readonly bug: BugId }
  | { readonly t: "bugDamaged"; readonly amount: number }
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
  | { readonly t: "loot"; readonly skill: SkillId }
  | { readonly t: "runEnd"; readonly phase: "won" | "lost" | "abandoned" }
  /** 階段を降りて次の階へ。 */
  | { readonly t: "nextFloor"; readonly floor: number }
  /** プレイヤーがバグの行動でダメージを受けた。 */
  | { readonly t: "playerDamaged"; readonly amount: number };

export interface RunState {
  /** ルール＋data のバージョン（Replay.version と同じ値）。 */
  readonly version: number;
  readonly seed: string;
  readonly phase: RunPhase;
  readonly floors: readonly FloorState[];
  readonly currentFloor: number;
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

export interface InitRunOptions {
  /** floorCount=1 で固定階（縦切り用）。>1 の時は multi-floor。 */
  readonly floorCount?: number;
}

/** 新しいランを始める。 */
export function initRun(
  seed: string,
  data: GameData = loadGameData(),
  opts: InitRunOptions = {},
): RunState {
  const starters = data.skills.skills.filter((s) => s.starter).map((s) => s.id);
  const floorCount = opts.floorCount ?? 1;
  let floors: FloorState[];
  if (floorCount === 1) {
    // 縦切り用：固定の3部屋一本道
    floors = [fixedFloor()];
  } else {
    const floorsData = loadFloors();
    floors = [];
    for (let i = 1; i <= Math.min(floorCount, floorsData.floors.length); i++) {
      floors.push(generateFloor(seed, i, { floors: floorsData, reinforcements: 0 }));
    }
  }
  return {
    version: RULES_VERSION,
    seed,
    phase: "map",
    floors,
    currentFloor: 1,
    roomId: floorCount === 1 ? "r0" : START_ROOM,
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

/** 現在の階を取得。 */
export function currentFloor(state: RunState): FloorState {
  return state.floors[state.currentFloor - 1]!;
}

/** 現在の階を更新して floors 配列を差し替える。 */
function withFloor(state: RunState, updater: (f: FloorState) => FloorState): RunState {
  const idx = state.currentFloor - 1;
  const floor = state.floors[idx]!;
  return {
    ...state,
    floors: [
      ...state.floors.slice(0, idx),
      updater(floor),
      ...state.floors.slice(idx + 1),
    ] as readonly FloorState[],
  };
}

function hasBugsLeft(floor: FloorState): boolean {
  return floor.rooms.some((r) => r.content.kind === "bug" && r.content.bugs.length > 0);
}

/** 部屋に残っている先頭のバグと戦闘を始める（いなければ map のまま）。 */
function enterRoom(state: RunState, data: GameData, events: RunEvent[]): RunState {
  const floor = currentFloor(state);
  const room = floor.rooms.find((r) => r.id === state.roomId);
  if (!room || room.content.kind !== "bug") return state;
  const bug = room.content.bugs[0];
  if (bug === undefined) return state;
  const battle = startBattle({
    data,
    runSeed: state.seed,
    n: state.battleCount,
    roomId: room.id,
    bug,
    candidates: candidatesForFloor(floor.number),
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
  const floor = currentFloor(state);
  const target = floor.rooms.find((r) => r.id === room);
  if (!target) return fail(state, "unknown_room", "その部屋はありません");
  const here = floor.rooms.find((r) => r.id === state.roomId);
  if (!here?.neighbors.includes(room)) return fail(state, "not_adjacent", "隣の部屋ではありません");

  const events: RunEvent[] = [{ t: "moved", room }];
  const moved: RunState = {
    ...withFloor(state, (f) => updateRoom(f, room, (r) => ({ ...r, visited: true }))),
    roomId: room,
  };
  if (target.content.kind === "stairs" && !hasBugsLeft(currentFloor(state))) {
    return {
      ...descend(moved),
      lastError: null,
      events: [...events, { t: "descended", floor: currentFloor(state).number + 1 }],
    };
  }
  const next = enterRoom(moved, data, events);
  return { ...next, lastError: null, events };
}

/** 次の階へ。増援はこの階のデグレ数で、使ったら 0 に戻す。 */
function descend(state: RunState): RunState {
  const n = currentFloor(state).number + 1;
  const floors =
    n <= floorCount()
      ? [
          ...state.floors,
          generateFloor(state.seed, n, {
            reinforcements: state.reinforcements,
            boss: n === floorCount(),
          }),
        ]
      : state.floors;
  return {
    ...state,
    currentFloor: n,
    floors,
    roomId: START_ROOM,
    floorRng: seedFrom(`floor:${state.seed}:${n}`),
    reinforcements: 0,
    battle: null,
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
  const closed: RunState = withFloor(state, (floor) =>
    updateRoom(floor, battle.roomId, (r) => {
      if (r.content.kind !== "bug") return r;
      const bugs = r.content.bugs.slice(1);
      return { ...r, content: bugs.length > 0 ? { ...r.content, bugs } : { kind: "empty" } };
    }),
  );
  const stats = { ...closed.stats, bugsClosed: closed.stats.bugsClosed + 1 };
  const curFloor = currentFloor(closed);
  if (!hasBugsLeft(curFloor)) {
    // この階のバグが全滅。最終階（boss）ならクリア、否则次の階へ
    if (curFloor.boss) {
      events.push({ t: "runEnd", phase: "won" });
      return { ...closed, phase: "won", stats, battle: null };
    }
    // 階段部屋が空なら次の階へ（stage 3 遷移）
    const farRoom = curFloor.rooms[curFloor.rooms.length - 1];
    if (farRoom?.content.kind === "empty" || farRoom?.content.kind === "stairs") {
      const nextNum = closed.currentFloor + 1;
      if (nextNum <= closed.floors.length) {
        return {
          ...closed,
          currentFloor: nextNum,
          phase: "map",
          battle: null,
          roomId: START_ROOM,
          player: { ...closed.player, cpu: closed.player.cpuMax },
          events: [...events, { t: "nextFloor", floor: nextNum }],
        };
      }
    }
    // 最終階のボスを倒した
    events.push({ t: "runEnd", phase: "won" });
    return { ...closed, phase: "won", stats, battle: null };
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
    case "loot": {
      const room = currentFloor(state).rooms.find((r) => r.id === state.roomId);
      if (!room || room.content.kind !== "chest") {
        return fail(state, "no_loot", "ここに宝箱はありません");
      }
      const skill = (room.content as Extract<RoomContent, { kind: "chest" }>).skill;
      if (state.player.skills.includes(skill)) {
        return fail(state, "already_owned", "すでに持っています");
      }
      const events: RunEvent[] = [{ t: "loot", skill }];
      const player = { ...state.player, skills: [...state.player.skills, skill] };
      const updated = withFloor(state, (f) =>
        updateRoom(f, room.id, (r) => ({ ...r, content: { kind: "empty" } })),
      );
      return { ...updated, player, lastError: null, events };
    }
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
    const here = currentFloor(state).rooms.find((r) => r.id === state.roomId);
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
  if (state.phase === "map") {
    const chestRoom = currentFloor(state).rooms.find(
      (r) => r.id === state.roomId && r.content.kind === "chest",
    );
    const chest = chestRoom?.content.kind === "chest" ? chestRoom.content : null;
    if (chest) {
      all.push({ t: "loot", pick: chest.skill });
    }
  }
  return all.filter((a) => apply(state, a, data).lastError === null);
}

/** src/core/replay.ts の runReplay に渡す Reducer。 */
export const runReducer: Reducer<RunState, Action> = {
  init: (seed) => initRun(seed),
  apply: (state, action) => apply(state, action),
};
