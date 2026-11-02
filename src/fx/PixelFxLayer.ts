import Phaser from "phaser";
import { clearFrame, composite, createFrame, createFx } from "pixelfx";
import type { FxInstance, FxModule, FxOptions, PixelFrame } from "pixelfx";

/**
 * pixelfx の描画結果を Phaser の CanvasTexture に流し込むレイヤー。
 * 演出専用。ルール(src/core)からは参照しない。
 */
export class PixelFxLayer {
  private readonly frame: PixelFrame;
  private readonly image: ImageData;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly active: FxInstance[] = [];
  readonly sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, key: string, width: number, height: number) {
    this.frame = createFrame(width, height);
    this.image = new ImageData(width, height);
    const tex = scene.textures.createCanvas(key, width, height);
    if (!tex) throw new Error(`failed to create canvas texture: ${key}`);
    this.texture = tex;
    this.sprite = scene.add.image(0, 0, key).setOrigin(0, 0);
  }

  play(mod: FxModule, options: FxOptions = {}): FxInstance {
    const fx = createFx(mod, options);
    this.active.push(fx);
    return fx;
  }

  /** dt は秒。 */
  update(dt: number): void {
    clearFrame(this.frame);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i] as FxInstance;
      fx.update(dt);
      if (fx.done()) {
        this.active.splice(i, 1);
        continue;
      }
      fx.draw(this.frame, "back");
      fx.draw(this.frame, "front");
    }
    composite(this.frame, this.image.data, null);
    this.texture.context.putImageData(this.image, 0, 0);
    this.texture.refresh();
  }

  get count(): number {
    return this.active.length;
  }
}
