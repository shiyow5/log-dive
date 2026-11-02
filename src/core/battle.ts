/**
 * 推理バトル（spec-a-mvp v0.1 §4 / v0.2）。純粋関数だけ。
 *
 * 縦切り（dev-plan-v3 §3 S2）の範囲: バグは off-by-one の行動のみ、
 * スキルは reproduce / read-log / hotfix / patch の4枚。残りは 11/05 の PR で足す。
 */
import {
  bugDef,
  skillDef,
  type BugId,
  type GameData,
  type SkillEffect,
  type SkillId,
} from "./data";
import { randPick, randShuffle } from "./rand";
import { seedFrom } from "./rng";
import type { BattleState, BugIntent, PlayerState, RunError, RunEvent } from "./run";

/** 縦切りで使えるスキル。 */
const BATTLE_SKILLS: readonly SkillId[] = ["reproduce", "read-log", "hotfix", "patch"];

export function battleSeed(runSeed: string, n: number): string {
  return `battle:${runSeed}:${n}`;
}

/** 次の行動の予告（画面に出す値）。 */
export function nextIntent(data: GameData, battle: Pick<BattleState, "bug" | "turn">): BugIntent {
  const b = bugDef(data, battle.bug).behavior;
  return { damage: b.damage };
}

/** 予告に対して実際に入るダメージ。 */
export function actualDamage(data: GameData, battle: BattleState): number {
  const b = bugDef(data, battle.bug).behavior;
  switch (b.kind) {
    case "off-by-one":
      // 境界ずれ: 予告より extra だけ多い
      return battle.intent.damage + b.extra;
    default:
      // 他の4種の行動パターンは 11/05 の PR で入れる。それまでは予告どおり。
      return battle.intent.damage;
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
}

export function startBattle(a: StartBattleArgs): BattleState {
  const def = bugDef(a.data, a.bug);
  // 公開順はシードで決まる（v0.2 決定7）
  const [order, rng] = randShuffle(seedFrom(battleSeed(a.runSeed, a.n)), def.symptoms);
  const candidates = a.candidates.includes(a.bug) ? a.candidates : [...a.candidates, a.bug];
  const base = { bug: a.bug, turn: 1 };
  return {
    roomId: a.roomId,
    bug: a.bug,
    boss: false,
    hp: def.hp,
    maxHp: def.hp,
    patchesLeft: 1,
    candidates: [...candidates],
    symptoms: [],
    hiddenSymptoms: order,
    reproduced: false,
    intent: nextIntent(a.data, base),
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
  if (!BATTLE_SKILLS.includes(id)) return err("skill_not_owned", "そのスキルはまだ使えません");
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
        return err("nothing_to_reveal", "これ以上わかる症状はありません");
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
        events: [{ t: "bugDamaged", amount }],
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
          events: [{ t: "bugDamaged", amount }],
          degraded: false,
        };
      }
      // デグレ: バグの HP を全回復（v0.2 決定1）。増援は run 側で数える
      return {
        battle: { ...battle, hp: battle.maxHp },
        player: paid,
        events: [{ t: "degrade" }],
        degraded: true,
      };
    }
    default:
      return err("skill_not_owned", "そのスキルはまだ使えません");
  }
}

export interface BugTurnResult {
  readonly battle: BattleState;
  readonly player: PlayerState;
  readonly events: readonly RunEvent[];
}

/** ターン終了: バグが行動し、次のターンの準備（CPU リセット・次の予告）をする。 */
export function bugTurn(data: GameData, battle: BattleState, player: PlayerState): BugTurnResult {
  const amount = Math.min(actualDamage(data, battle), player.hp);
  const turn = battle.turn + 1;
  return {
    battle: { ...battle, turn, intent: nextIntent(data, { bug: battle.bug, turn }) },
    // CPU は毎ターン上限にリセット（持ち越しなし。v0.2 決定5）
    player: { ...player, hp: player.hp - amount, cpu: player.cpuMax },
    events: [{ t: "playerDamaged", amount }],
  };
}

export function isRunError(v: unknown): v is RunError {
  return typeof v === "object" && v !== null && "code" in v && "message" in v;
}
