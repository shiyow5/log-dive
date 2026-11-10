import type { FxInstance, FxModule, FxOptions } from "pixelfx";
import type { RunEvent } from "../scenes/run-port";
import { FX_MAP, fxNameFor } from "./fx-map";
import type { FxEventName } from "./fx-map";

/** エフェクトを描く先（実体は PixelFxLayer。テストでは差し替える）。 */
export interface FxSink {
  play(mod: FxModule, options?: FxOptions, ttlSec?: number | null): FxInstance;
  stopAll(): void;
  destroy(): void;
}

export interface FxSinks {
  back: FxSink;
  front: FxSink;
}

/** もう再生した RunEvent 配列（シーン再入場で同じ演出を二重に出さない）。 */
const played = new WeakSet<readonly RunEvent[]>();

/**
 * イベント名でエフェクトを呼ぶ窓口。
 * - enabled() が false（?fx=0 / 視差効果を減らす）なら何も再生しない
 * - dispose() で再生中のものを止めて破棄する（背景エフェクトのリーク防止）
 */
export class FxDirector {
  private disposed = false;

  constructor(
    private readonly sinks: FxSinks | null,
    private readonly enabled: () => boolean,
  ) {}

  /** 1 つでも再生したら true。 */
  emit(name: FxEventName, seed = 1): boolean {
    if (this.disposed || !this.sinks || !this.enabled()) return false;
    const specs = FX_MAP[name];
    specs.forEach((spec, i) => {
      const opts: FxOptions = { seed: seed + i, ...spec.options };
      if (spec.x !== undefined) opts.x = spec.x;
      if (spec.y !== undefined) opts.y = spec.y;
      this.sinks?.[spec.layer].play(spec.mod, opts, spec.ttl ?? null);
    });
    return specs.length > 0;
  }

  /** ゲームのイベント列を演出にする。同じ配列は 1 回だけ。 */
  emitRunEvents(events: readonly RunEvent[], seed = 1): boolean {
    if (played.has(events)) return false;
    played.add(events);
    let any = false;
    for (const e of events) {
      const name = fxNameFor(e);
      if (name && this.emit(name, seed)) any = true;
    }
    return any;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sinks?.back.destroy();
    this.sinks?.front.destroy();
  }
}
