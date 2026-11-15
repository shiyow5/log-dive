import type { BugId } from "../core/data";
import type { RunState } from "../core/run";

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

/** 次の挑戦へのひとこと（誤パッチが多いほど「ログ確認」を勧める。数値は表示するだけで判定に使わない）。 */
export function defeatHint(d: DefeatSummary): string {
  return d.wrongPatches === 0
    ? "誤パッチはなし。ターンごとの予告ダメージに間に合うよう、再現→ログ確認→パッチを急ごう。"
    : "誤パッチはバグを悪化させる。迷ったらログ確認で候補を減らしてからパッチしよう。";
}
