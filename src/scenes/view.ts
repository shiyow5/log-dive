import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from "../config";

/** シーンのカメラを RENDER_SCALE 倍にして、ゲーム内座標 320×180 が画面全体に収まるようにする。create() の先頭で呼ぶ。 */
export function setupView(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
}
