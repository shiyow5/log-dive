/** 内部解像度（ドット）。表示は FIT で拡大する。 */
export const GAME_WIDTH = 320;
export const GAME_HEIGHT = 180;

/** Phaser Text 用のフォント指定。CSS 側の --ld-font（src/ui/hud.css）と同じ値にする。 */
export const FONT_FAMILY = '"DotGothic16", monospace';

/** 戦闘画面のバグの位置（ドット）。BattleScene の描画と fx-map の演出位置で共有する。 */
export const BUG_POS = { x: GAME_WIDTH / 2, y: 44 } as const;
