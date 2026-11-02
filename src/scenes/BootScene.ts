import Phaser from "phaser";
import * as glitch from "pixelfx/fx/scifi/glitch";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { PixelFxLayer } from "../fx/PixelFxLayer";
import { Rng } from "../core/rng";
import { fxEnabled } from "../ui/flags";
import { goTo } from "./transition";

export const TITLE = "ログ潜り ― Log Dive";

/** 起動ロゴ。演出ありならグリッチを 0.6 秒見せてからタイトルへ、?fx=0 ならすぐタイトルへ。 */
export class BootScene extends Phaser.Scene {
  private fx?: PixelFxLayer;

  constructor() {
    super("boot");
  }

  create(): void {
    document.body.dataset.scene = "boot";
    this.game.events.emit("ready");
    if (!fxEnabled()) {
      goTo(this, "title");
      return;
    }
    const rng = new Rng("boot");
    this.fx = new PixelFxLayer(this, "fx-boot", GAME_WIDTH, GAME_HEIGHT);
    this.fx.play(glitch, { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, seed: rng.int(1, 9999) });
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, TITLE, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e4f1ec",
      })
      .setOrigin(0.5);
    this.time.delayedCall(600, () => goTo(this, "title"));
  }

  override update(_time: number, delta: number): void {
    this.fx?.update(delta / 1000);
  }
}
