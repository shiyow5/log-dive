import type { RunEvent } from "../core/run";

export type LogTone = "damage" | "clear" | "progress";

/**
 * 直前の操作のイベントから強調の種類を決める純関数（#116）。
 * 優先順は damage > clear > progress。該当なしは null。
 */
export function logTone(events: readonly { t: RunEvent["t"] }[]): LogTone | null {
  if (events.some((e) => e.t === "playerDamaged")) return "damage";
  if (events.some((e) => e.t === "bugClosed")) return "clear";
  if (events.some((e) => e.t === "stairsOpened" || e.t === "descended" || e.t === "looted"))
    return "progress";
  return null;
}
