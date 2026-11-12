/**
 * 推理バトル（spec-a-mvp v0.1 §4 / v0.2）。純粋関数だけ。
 *
 * バグの行動: 5種すべて（off-by-one・null-ref・race・leak・infinite-loop）。
 * スキルは6枚（reproduce / read-log / hotfix / patch / breakpoint / bisect）。
 */
import {
  bossDef,
  bugDef,
  skillDef,
  type BugId,
  type GameData,
  type SkillEffect,
  type SkillId,
} from "./data";
import { randPick, randShuffle } from "./rand";
import { seedFrom, type RngState } from "./rng";
import type { BattleState, BugIntent, PlayerState, RunError, RunEvent } from "./run";

export function battleSeed(runSeed: string, n: number): string {
  return `battle:${runSeed}:${n}`;
}

/** 戦闘開始時の予告（画面に出す値）。 */
export function firstIntent(data: GameData, bug: BugId): BugIntent {
  const b = bugDef(data, bug).behavior;
  switch (b.kind) {
    case "null-ref":
      return nullRefIntent(b, b.period - 1);
    default:
      return { damage: b.damage };
  }
}

/**
 * バグが行動したあとの次の予告。
 * null-ref のカウンタはバグが実際に行動したときだけ進める（breakpoint で止めた回は呼ばない。v0.2 決定6）。
 */
export function advanceIntent(data: GameData, bug: BugId, prev: BugIntent): BugIntent {
  const b = bugDef(data, bug).behavior;
  switch (b.kind) {
    case "null-ref": {
      const left = prev.countdown ?? b.period - 1;
      return nullRefIntent(b, left === 0 ? b.period - 1 : left - 1);
    }
    case "leak":
      // メモリリーク: 行動するたびに growth ずつ重くなる（cap で頭打ち）
      return { damage: Math.min(prev.damage + b.growth, b.cap) };
    default:
      return { damage: b.damage };
  }
}

/**
 * 次のターンの CPU。毎ターン上限にリセットしてから（v0.2 決定5）、
 * infinite-loop はそのターンだけ cpuDrain 減らす（0 未満にはしない）。
 */
export function nextTurnCpu(data: GameData, bug: BugId, cpuMax: number): number {
  const b = bugDef(data, bug).behavior;
  const drain = b.kind === "infinite-loop" ? b.cpuDrain : 0;
  return Math.max(0, cpuMax - drain);
}

/** null-ref の予告。countdown=0 のターンが大ダメージ（period ターンに1回）。 */
function nullRefIntent(
  b: { readonly damage: number; readonly bigDamage: number },
  countdown: number,
): BugIntent {
  return { damage: countdown === 0 ? b.bigDamage : b.damage, countdown };
}

/** 予告に対して実際に入るダメージと、使った後の戦闘用乱数。 */
export function actualDamage(data: GameData, battle: BattleState): [number, RngState] {
  const b = bugDef(data, battle.bug).behavior;
  switch (b.kind) {
    case "off-by-one":
      // 境界ずれ: 予告より extra だけ多い
      return [battle.intent.damage + b.extra, battle.rng];
    case "race": {
      // 競合状態: 予告の 0 倍か 2 倍（戦闘用乱数で決まる）
      const [m, rng] = randPick(battle.rng, b.multipliers);
      return [battle.intent.damage * m, rng];
    }
    default:
      // null-ref・leak・infinite-loop は予告どおり（増え方・大ダメージは予告に出ている）
      return [battle.intent.damage, battle.rng];
  }
}

export interface StartBattleArgs {
  readonly data: GameData;
  readonly runSeed: string;
  /** これまでに始めた戦闘の数（乱数の n）。 */
  readonly n: number;
  readonly roomId: string;
  readonly bug: BugId;
  readonly candidates: readonly BugId[];
  /** ボス戦闘か（デフォルト false）。ボスなら HP・patchesLeft が上書きされる。 */
  readonly boss?: boolean;
  /** ボスの現在 HP 補正（デグレ分）。boss=true のときのみ使用。 */
  readonly bossHpBonus?: number;
}

export function startBattle(a: StartBattleArgs): BattleState {
  const def = bugDef(a.data, a.bug);
  // ボス戦闘の場合
  if (a.boss) {
    const boss = bossDef(a.data);
    const hp = Math.min(boss.hp + (a.bossHpBonus ?? 0) * boss.degradeHpBonus, boss.hpCap);
    // 公開順はシードで決まる（v0.2 決定7）
    const allSymptoms = [boss.noiseSymptom, ...def.symptoms];
    const [order, rng] = randShuffle(seedFrom(battleSeed(a.runSeed, a.n)), allSymptoms);
    const candidates = a.candidates.includes(a.bug) ? a.candidates : [...a.candidates, a.bug];
    return {
      roomId: a.roomId,
      bug: a.bug,
      boss: true,
      hp: hp,
      maxHp: hp,
      patchesLeft: boss.patchesRequired,
      patchesTotal: boss.patchesRequired,
      candidates: [...candidates],
      symptoms: [],
      hiddenSymptoms: order,
      reproduced: false,
      intent: firstIntent(a.data, a.bug),
      turn: 1,
      rng,
      halted: false,
    };
  }
  // 通常戦闘
  const [order, rng] = randShuffle(seedFrom(battleSeed(a.runSeed, a.n)), def.symptoms);
  const candidates = a.candidates.includes(a.bug) ? a.candidates : [...a.candidates, a.bug];
  return {
    roomId: a.roomId,
    bug: a.bug,
    boss: false,
    hp: def.hp,
    maxHp: def.hp,
    patchesLeft: 1,
    patchesTotal: 1,
    candidates: [...candidates],
    symptoms: [],
    hiddenSymptoms: order,
    reproduced: false,
    halted: false,
    intent: firstIntent(a.data, a.bug),
    turn: 1,
    rng,
  };
}

export interface SkillResult {
  readonly battle: BattleState;
  readonly player: PlayerState;
  readonly events: readonly RunEvent[];
  /** デグレしたか（run 側で集計する）。 */
  readonly degraded: boolean;
}

function err(code: RunError["code"], message: string): RunError {
  return { code, message };
}

/**
 * スキルを使う。不正なら RunError を返す（状態は変えない）。
 * 撃破の判定（hp<=0）は run 側で行う。
 */
export function useSkill(
  data: GameData,
  battle: BattleState,
  player: PlayerState,
  id: SkillId,
  arg: BugId | undefined,
): SkillResult | RunError {
  if (!player.skills.includes(id)) return err("skill_not_owned", "そのスキルは持っていません");
  const def = skillDef(data, id);
  // 意味の無い操作の理由を先に返し、最後に CPU を見る（どちらでも CPU は減らさない）
  const r = resolveSkill(battle, { ...player, cpu: player.cpu - def.cpu }, def.effect, arg);
  if (isRunError(r)) return r;
  if (player.cpu < def.cpu) return err("not_enough_cpu", "CPU が足りません");
  return r;
}

function resolveSkill(
  battle: BattleState,
  paid: PlayerState,
  effect: SkillEffect,
  arg: BugId | undefined,
): SkillResult | RunError {
  switch (effect.kind) {
    case "reproduce": {
      const [text, ...rest] = battle.hiddenSymptoms;
      if (text === undefined) {
        if (battle.reproduced) {
          return err("nothing_to_reveal", "これ以上わかる症状はありません");
        }
        // breakpoint で症状を出し切っていても、未再現なら再現だけは通す（PR #41 QA 指摘1）
        return {
          battle: { ...battle, reproduced: true },
          player: paid,
          events: [{ t: "reproduced" }],
          degraded: false,
        };
      }
      return {
        battle: {
          ...battle,
          reproduced: true,
          symptoms: [...battle.symptoms, text],
          hiddenSymptoms: rest,
        },
        player: paid,
        events: [{ t: "symptom", text }],
        degraded: false,
      };
    }
    case "read-log": {
      const wrong = battle.candidates.filter((c) => c !== battle.bug);
      if (battle.candidates.length <= 1 || wrong.length === 0) {
        return err("too_few_candidates", "候補はもう1つだけです");
      }
      const [removed, rng] = randPick(battle.rng, wrong);
      return {
        battle: { ...battle, candidates: battle.candidates.filter((c) => c !== removed), rng },
        player: paid,
        events: [{ t: "candidateRemoved", bug: removed }],
        degraded: false,
      };
    }
    case "hotfix": {
      const amount = Math.min(effect.damage, battle.hp);
      return {
        battle: { ...battle, hp: battle.hp - amount },
        player: paid,
        events: [{ t: "bugDamaged", amount, by: "hotfix" }],
        degraded: false,
      };
    }
    case "patch": {
      if (arg === undefined) return err("missing_arg", "パッチの種類を選んでください");
      if (!battle.candidates.includes(arg)) {
        return err("not_a_candidate", "その種類は候補から消えています");
      }
      if (!battle.reproduced) {
        return err("not_reproduced", "再現できていないバグは直せません");
      }
      if (arg === battle.bug) {
        const amount = Math.min(effect.damage, battle.hp);
        return {
          battle: {
            ...battle,
            hp: battle.hp - amount,
            patchesLeft: Math.max(0, battle.patchesLeft - 1),
          },
          player: paid,
          events: [
            {
              t: "bugDamaged",
              amount,
              by: "patch",
              patchNo: battle.patchesTotal - battle.patchesLeft + 1,
            },
          ],
          degraded: false,
        };
      }
      // デグレ: バグの HP を全回復（v0.2 決定1）。増援は run 側で数える。
      // 外れた候補は候補から外す（再選択不可。#154 案A）
      return {
        battle: {
          ...battle,
          hp: battle.maxHp,
          candidates: battle.candidates.filter((c) => c !== arg),
        },
        player: paid,
        events: [{ t: "degrade" }],
        degraded: true,
      };
    }
    case "breakpoint": {
      if (battle.halted) return err("already_halted", "次の行動はもう止めています");
      const [text, ...rest] = battle.hiddenSymptoms;
      const events: RunEvent[] = [{ t: "halted" }];
      if (text !== undefined) events.push({ t: "symptom", text });
      return {
        battle: {
          ...battle,
          halted: true,
          symptoms: text === undefined ? battle.symptoms : [...battle.symptoms, text],
          hiddenSymptoms: rest,
        },
        player: paid,
        events,
        degraded: false,
      };
    }
    case "bisect": {
      const n = battle.candidates.length;
      const wrong = battle.candidates.filter((c) => c !== battle.bug);
      if (n <= 1 || wrong.length === 0) return err("too_few_candidates", "候補はもう1つだけです");
      // 半分（切り捨て）消す。2以下なら1つ。正解は消さない（v0.2 決定7）
      const count = n <= 2 ? 1 : Math.floor(n / 2);
      const [order, rng] = randShuffle(battle.rng, wrong);
      const removed = order.slice(0, count);
      return {
        battle: {
          ...battle,
          candidates: battle.candidates.filter((c) => !removed.includes(c)),
          rng,
        },
        player: paid,
        events: removed.map((bug): RunEvent => ({ t: "candidateRemoved", bug })),
        degraded: false,
      };
    }
  }
}

export interface BugTurnResult {
  readonly battle: BattleState;
  readonly player: PlayerState;
  readonly events: readonly RunEvent[];
}

/** ターン終了: バグが行動し、次のターンの準備（CPU リセット・次の予告）をする。 */
export function bugTurn(data: GameData, battle: BattleState, player: PlayerState): BugTurnResult {
  if (battle.halted) {
    // breakpoint で止めた回: ダメージなし・予告とカウンタは進めない・CPU 減少もなし（v0.2 決定6）
    return {
      battle: { ...battle, halted: false, turn: battle.turn + 1 },
      player: { ...player, cpu: player.cpuMax },
      events: [{ t: "bugHaltedTurn" }],
    };
  }
  const [damage, rng] = actualDamage(data, battle);
  const amount = Math.min(damage, player.hp);
  return {
    battle: {
      ...battle,
      turn: battle.turn + 1,
      intent: advanceIntent(data, battle.bug, battle.intent),
      rng,
    },
    // CPU は毎ターン上限にリセット（持ち越しなし）→ infinite-loop の分だけ減らす
    player: {
      ...player,
      hp: player.hp - amount,
      cpu: nextTurnCpu(data, battle.bug, player.cpuMax),
    },
    events: [{ t: "playerDamaged", amount }],
  };
}

export function isRunError(v: unknown): v is RunError {
  return typeof v === "object" && v !== null && "code" in v && "message" in v;
}
