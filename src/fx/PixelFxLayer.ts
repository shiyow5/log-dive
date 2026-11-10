import Phaser from "phaser";
import { clearFrame, composite, createFrame, createFx } from "pixelfx";
import type { FxInstance, FxModule, FxOptions, PixelFrame } from "pixelfx";

interface Entry {
  fx: FxInstance;
  /** 経過秒 */
  age: number;
  /** この秒数で stop() する（ループ系を一発ものとして使うため）。null なら止めない */
  ttl: number | null;
}

/**
 * pixelfx の描画結果を Phaser の CanvasTexture に流し込むレイヤー。
 * 演出専用。ルール(src/core)からは参照しない。
 */
export class PixelFxLayer {
  private readonly frame: PixelFrame;
  private readonly image: ImageData;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly textures: Phaser.Textures.TextureManager;
  private readonly key: string;
  private active: Entry[] = [];
  readonly sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, key: string, width: number, height: number) {
    this.frame = createFrame(width, height);
    this.image = new ImageData(width, height);
    this.textures = scene.textures;
    this.key = key;
    // シーン再入場（restart）で前回のテクスチャが残っていても作り直せるようにする
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = scene.textures.createCanvas(key, width, height);
    if (!tex) throw new Error(`failed to create canvas texture: ${key}`);
    this.texture = tex;
    this.sprite = scene.add.image(0, 0, key).setOrigin(0, 0);
  }

  play(mod: FxModule, options: FxOptions = {}, ttlSec: number | null = null): FxInstance {
    const fx = createFx(mod, options);
    this.active.push({ fx, age: 0, ttl: ttlSec });
    return fx;
  }

  /** dt は秒。 */
  update(dt: number): void {
    clearFrame(this.frame);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i] as Entry;
      e.age += dt;
      if (e.ttl !== null && e.age >= e.ttl) {
        e.fx.stop();
        e.ttl = null;
      }
      e.fx.update(dt);
      if (e.fx.done()) {
        this.active.splice(i, 1);
        continue;
      }
      e.fx.draw(this.frame, "back");
      e.fx.draw(this.frame, "front");
    }
    composite(this.frame, this.image.data, null);
    this.texture.context.putImageData(this.image, 0, 0);
    this.texture.refresh();
  }

  /** 再生中のものを全部止める（フェードアウトして消える）。 */
  stopAll(): void {
    for (const e of this.active) e.fx.stop();
  }

  /** 止めてテクスチャごと破棄する。シーン離脱時に呼ぶ。 */
  destroy(): void {
    this.stopAll();
    this.active = [];
    this.sprite.destroy();
    if (this.textures.exists(this.key)) this.textures.remove(this.key);
  }

  get count(): number {
    return this.active.length;
  }
}
