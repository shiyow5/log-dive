import Phaser from "phaser";
import { fxEnabled, markFade } from "../ui/flags";
import { clearHud, setHudBusy } from "../ui/hud";

/** 画面遷移。演出ありなら 200ms の暗転（ease-out 相当）、?fx=0 なら即時。遷移中は HUD の入力を止める。 */
export function goTo(scene: Phaser.Scene, key: string, data?: object): void {
  if (scene.scene.key === key) {
    scene.scene.restart(data);
    return;
  }
  if (!fxEnabled()) {
    clearHud();
    scene.scene.start(key, data);
    return;
  }
  setHudBusy(true);
  scene.cameras.main.fadeOut(200, 15, 26, 28);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    clearHud();
    setHudBusy(false);
    scene.scene.start(key, data);
  });
}

/** 画面に入ったときのフェードイン。 */
export function fadeIn(scene: Phaser.Scene): void {
  if (!fxEnabled()) return;
  markFade(200);
  scene.cameras.main.fadeIn(200, 15, 26, 28);
}
