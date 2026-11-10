import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const zzfx = vi.fn();
vi.mock("zzfx", () => ({
  zzfx,
  ZZFX: { audioContext: { state: "running" }, sampleRate: 44100 },
}));

function stubStorage(failWrites: boolean): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failWrites) throw new Error("QuotaExceededError");
      store.set(k, v);
    },
  });
}

describe("player", () => {
  beforeEach(() => {
    vi.resetModules();
    zzfx.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("保存に失敗してもミュートの切り替えはこの画面で効く", async () => {
    stubStorage(true);
    const p = await import("../../src/audio/player");
    expect(p.isMuted()).toBe(false);
    expect(p.toggleMute()).toBe(true);
    expect(p.isMuted()).toBe(true);
    expect(p.toggleMute()).toBe(false);
  });

  it("読み込み待ちの間にミュートしたら、待っていた SE は鳴らさない", async () => {
    stubStorage(false);
    const p = await import("../../src/audio/player");
    p.playSfx("click");
    p.toggleMute();
    await vi.dynamicImportSettled();
    expect(zzfx).not.toHaveBeenCalled();
  });

  it("ミュートしていなければ鳴らす", async () => {
    stubStorage(false);
    const p = await import("../../src/audio/player");
    p.playSfx("click");
    await vi.dynamicImportSettled();
    expect(zzfx).toHaveBeenCalledTimes(1);
  });
});
