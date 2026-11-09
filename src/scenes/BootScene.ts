import Phaser from "phaser";
import * as glitch from "pixelfx/fx/scifi/glitch";
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { PixelFxLayer } from "../fx/PixelFxLayer";
import { Rng } from "../core/rng";
import { fxEnabled } from "../ui/flags";
import { goTo } from "./transition";

export const TITLE = "ログ潜り ― Log Dive";

/** フォント読み込みを待つ（失敗時は monospace にフォールバックして先に進む）。 */
async function waitForFont(): Promise<void> {
  if (!document.fonts) return; // polyfill なし環境はスキップ
  try {
    await Promise.race([
      document.fonts.load('12px "DotGothic16"'),
      // 5秒タイムアウトは失敗時のフォールバック（e2e をブロックしない）
      new Promise<void>((_res) => setTimeout(_res, 5000)),
    ]);
  } catch {
    // 読み込めなくても先に進む（Phaser は fallback で monospace を使う）
  }
}

/** 起動ロゴ。演出ありならグリッチを 0.6 秒見せてからタイトルへ、?fx=0 ならすぐタイトルへ。 */
export class BootScene extends Phaser.Scene {
  private fx?: PixelFxLayer;

  constructor() {
    super("boot");
  }

  async create(): Promise<void> {
    document.body.dataset.scene = "boot";
    this.game.events.emit("ready");

    // フォント読み込みを待ってから Text を描く（Phaser Text は後から再描画されないため。5秒タイムアウトでフォールバック）
    await waitForFont();

    if (!fxEnabled()) {
      goTo(this, "title");
      return;
    }
    const rng = new Rng("boot");
    this.fx = new PixelFxLayer(this, "fx-boot", GAME_WIDTH, GAME_HEIGHT);
    this.fx.play(glitch, { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, seed: rng.int(1, 9999) });
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, TITLE, {
        fontFamily: FONT_FAMILY,
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
