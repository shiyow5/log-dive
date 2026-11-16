import type { BugId } from "../core/data";
import type { RunState } from "../core/run";
import { enemyKindFor, type EnemyKind } from "../art/enemy-sprites";

/**
 * リザルトの結果表（#95 minori 指定値 11/10 14:14）。ラベルは指定の原文どおり。
 * 前回比は保留（rei 判断待ち・sota 11/16）なので出さない。
 */
export function resultRows(s: RunState): [label: string, value: string][] {
  return [
    ["到達階", `${s.floor.number}階`],
    ["倒したバグ", String(s.stats.bugsClosed)],
    ["使ったターン", String(s.stats.turns)],
    ["今回のシード", s.seed],
  ];
}

/** 表の下の一言ヒント（#95 指定値の原文。クリア時は物語の締め文を出すので使わない）。 */
export const RESULT_HINT = "次は再現してから修正してみよう";

/** 背景に薄く出す敵ドット絵（#95）。戦闘中に終わったらその敵、クリアはボス、それ以外は通常のバグ。 */
export function resultEnemyKind(s: RunState): EnemyKind {
  if (s.phase === "won") return "boss";
  return s.battle ? enemyKindFor(s.battle.roomId, s.battle.boss) : "bug";
}

export interface DefeatSummary {
  /** 最後に戦っていたバグの種類（戦闘中にダウンしたときだけ。マップ放棄などは null）。 */
  readonly bug: BugId;
  readonly boss: boolean;
  /** このランでの誤パッチ（デグレ）の累計。 */
  readonly wrongPatches: number;
}

/** 敗北（ダウン）リザルトに出す「最後のバグ」と誤パッチ回数（#118）。ダウン以外・戦闘なしは null。 */
export function defeatSummary(s: RunState): DefeatSummary | null {
  if (s.phase !== "lost" || !s.battle) return null;
  return { bug: s.battle.bug, boss: s.battle.boss, wrongPatches: s.stats.degrades };
}
