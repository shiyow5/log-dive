/** 戦闘HUDで「次に押すべきボタン」を決める（#93）。 */
export type Recommended = "reproduce" | "patch" | "endTurn";

/**
 * 未再現→再現する / 再現済み→修正パッチ / それが押せない（CPU不足など）→ターン終了。
 * 戻り値は常に 1 つ（推奨枠が複数にならない）。
 */
export function recommend(
  reproduced: boolean,
  canReproduce: boolean,
  canPatch: boolean,
): Recommended {
  if (!reproduced && canReproduce) return "reproduce";
  if (reproduced && canPatch) return "patch";
  return "endTurn";
}
