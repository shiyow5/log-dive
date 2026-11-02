import Phaser from "phaser";
import * as glitch from "pixelfx/fx/scifi/glitch";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { PixelFxLayer } from "../fx/PixelFxLayer";
import { Rng } from "../core/rng";

export const TITLE = "ログ潜り ― Log Dive";

export class BootScene extends Phaser.Scene {
  private fx?: PixelFxLayer;

  constructor() {
    super("boot");
  }

  create(): void {
    const rng = new Rng("boot");
    this.fx = new PixelFxLayer(this, "fx-boot", GAME_WIDTH, GAME_HEIGHT);
    this.fx.play(glitch, { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, seed: rng.int(1, 9999) });
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, TITLE, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e6e6e6",
      })
      .setOrigin(0.5);
    this.game.events.emit("ready");
    document.body.dataset.scene = "boot";
  }

  override update(_time: number, delta: number): void {
    this.fx?.update(delta / 1000);
  }
}
