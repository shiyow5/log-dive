import { describe, expect, it, vi } from "vitest";
import { FxDirector } from "../../src/fx/FxDirector";
import type { FxSink } from "../../src/fx/FxDirector";
import { FX_MAP, fxNameFor } from "../../src/fx/fx-map";
import type { FxEventName } from "../../src/fx/fx-map";
import type { RunEvent } from "../../src/scenes/run-port";

function fakeSink(): FxSink & { play: ReturnType<typeof vi.fn> } {
  return {
    play: vi.fn(() => ({ update() {}, draw() {}, stop() {}, done: () => true })),
    stopAll: vi.fn(),
    destroy: vi.fn(),
  };
}

const NAMES = Object.keys(FX_MAP) as FxEventName[];

describe("fx-map（イベント名 → エフェクト）", () => {
  it("全イベントに 1 つ以上のエフェクトがある", () => {
    for (const n of NAMES) expect(FX_MAP[n].length).toBeGreaterThan(0);
  });

  it("RunEvent を演出名に対応づける", () => {
    expect(fxNameFor({ t: "playerDamaged", amount: 3 })).toBe("playerHit");
    expect(fxNameFor({ t: "bugDamaged", amount: 3, by: "hotfix" })).toBe("bugHit");
    expect(fxNameFor({ t: "bugClosed", bug: "off-by-one" as never })).toBe("bugDefeated");
    expect(fxNameFor({ t: "looted", skill: "hotfix" as never })).toBe("chestOpen");
    expect(fxNameFor({ t: "descended", floor: 2 })).toBe("stairs");
    expect(fxNameFor({ t: "battleStart", room: "r1" })).toBe("battleStart");
    expect(fxNameFor({ t: "runEnd", phase: "won" })).toBe("result");
    expect(fxNameFor({ t: "runEnd", phase: "lost" })).toBeNull();
    expect(fxNameFor({ t: "moved", room: "r1" })).toBeNull();
  });
});

describe("battleStart（Issue #106）", () => {
  it("敵・敵名・HP バーに重ならないよう、手前(front)には出さない", () => {
    for (const spec of FX_MAP.battleStart) expect(spec.layer).toBe("back");
  });
});

describe("FxDirector", () => {
  it("演出が有効なら対応表どおりのレイヤーに再生する", () => {
    const back = fakeSink();
    const front = fakeSink();
    const d = new FxDirector({ back, front }, () => true);
    expect(d.emit("mapAmbient")).toBe(true);
    expect(back.play).toHaveBeenCalledTimes(FX_MAP.mapAmbient.length);
    expect(front.play).not.toHaveBeenCalled();
  });

  it("enabled() が false（?fx=0 など）なら 1 つも再生しない", () => {
    const back = fakeSink();
    const front = fakeSink();
    const d = new FxDirector({ back, front }, () => false);
    for (const n of NAMES) expect(d.emit(n)).toBe(false);
    expect(d.emitRunEvents([{ t: "runEnd", phase: "won" }])).toBe(false);
    expect(back.play).not.toHaveBeenCalled();
    expect(front.play).not.toHaveBeenCalled();
  });

  it("sinks なし（?fx=0 で canvas を作らない場合）でも落ちない", () => {
    const d = new FxDirector(null, () => true);
    expect(d.emit("title")).toBe(false);
    expect(() => d.dispose()).not.toThrow();
  });

  it("同じ RunEvent 配列は 1 回しか再生しない", () => {
    const front = fakeSink();
    const d = new FxDirector({ back: fakeSink(), front }, () => true);
    const events: RunEvent[] = [{ t: "descended", floor: 2 }];
    expect(d.emitRunEvents(events)).toBe(true);
    const n = front.play.mock.calls.length;
    expect(d.emitRunEvents(events)).toBe(false);
    expect(front.play.mock.calls.length).toBe(n);
  });

  it("dispose() で両レイヤーを破棄し、その後は再生しない", () => {
    const back = fakeSink();
    const front = fakeSink();
    const d = new FxDirector({ back, front }, () => true);
    d.dispose();
    expect(back.destroy).toHaveBeenCalledTimes(1);
    expect(front.destroy).toHaveBeenCalledTimes(1);
    expect(d.emit("title")).toBe(false);
    expect(back.play).not.toHaveBeenCalled();
  });
});
