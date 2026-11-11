/**
 * ボス戦・クリア画面の物語文言（唯一の置き場）。
 * 台本の正式文言は fumino に確認中（#128）。確定したらこのファイルだけ差し替える。
 */
export const STORY = {
  /** ボス戦の見出し。{room} は部屋名（関数名）。 */
  bossTitle: (room: string): string => `根本原因 #BUG-000 — ${room}`,
  /** ボス登場時のログ。 */
  bossAppear: "ここが、すべての障害の出どころだ",
  /** ボスへの1回目のパッチ後（まだ根が残っている）。 */
  bossPatched: (hp: number, maxHp: number): string =>
    `効いた。でも根が残っている（HP ${hp}/${maxHp}）`,
  /** クリア画面の締めの一文（「復旧完了」の下）。 */
  clearEpilogue: "障害の根本原因を閉じた。サーバーは静かになった",
  /** クリア画面の数値の見出し。 */
  clearStatsHeading: (n: number): string => `全バグ票 ${n} 件クローズ`,
} as const;
