import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { fxEnabled } from "../ui/flags";
import { FxDirector } from "./FxDirector";
import { PixelFxLayer } from "./PixelFxLayer";

/**
 * シーン用の FxDirector を作る。シーンが閉じる/再起動するときに自動で破棄する。
 * ?fx=0 のときは canvas も作らない。
 */
export function createSceneFx(scene: Phaser.Scene, keyPrefix: string): FxDirector {
  if (!fxEnabled()) return new FxDirector(null, fxEnabled);
  const back = new PixelFxLayer(scene, `${keyPrefix}-back`, GAME_WIDTH, GAME_HEIGHT);
  back.sprite.setDepth(-10);
  const front = new PixelFxLayer(scene, `${keyPrefix}-front`, GAME_WIDTH, GAME_HEIGHT);
  front.sprite.setDepth(10);
  const director = new FxDirector({ back, front }, fxEnabled);
  const tick = (_t: number, delta: number) => {
    back.update(delta / 1000);
    front.update(delta / 1000);
  };
  scene.events.on("update", tick);
  scene.events.once("shutdown", () => {
    scene.events.off("update", tick);
    director.dispose();
  });
  return director;
}
