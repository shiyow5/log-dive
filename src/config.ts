/** 内部解像度（ドット）。表示は FIT で拡大する。 */
export const GAME_WIDTH = 320;
export const GAME_HEIGHT = 180;

/**
 * 描画の拡大率。canvas は GAME_WIDTH×RENDER_SCALE の実ピクセルで作り、カメラを setZoom(RENDER_SCALE) にする。
 * ゲーム内座標は 320×180 のまま。Text は同じ倍率の resolution で描くので、小さい字も潰れない。
 */
export const RENDER_SCALE = 4;

/** Phaser Text 用のフォント指定。CSS 側の --ld-font（src/ui/hud.css）と同じ値にする。 */
export const FONT_FAMILY = '"DotGothic16", monospace';

/** 戦闘画面のバグの位置（ドット）。BattleScene の描画と fx-map の演出位置で共有する。 */
export const BUG_POS = { x: GAME_WIDTH / 2, y: 44 } as const;
