import { afterEach, describe, expect, it, vi } from "vitest";
import { onReducedMotion } from "../../src/ui/flags";

function stubMatchMedia() {
  const handlers = new Set<(e: { matches: boolean }) => void>();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: (_: string, h: (e: { matches: boolean }) => void) => handlers.add(h),
    removeEventListener: (_: string, h: (e: { matches: boolean }) => void) => handlers.delete(h),
  }));
  return (matches: boolean) => {
    for (const h of [...handlers]) h({ matches });
  };
}

describe("onReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("途中で「視差効果を減らす」が有効になったときだけ呼ぶ", () => {
    const change = stubMatchMedia();
    const cb = vi.fn();
    onReducedMotion(cb);
    change(false);
    expect(cb).not.toHaveBeenCalled();
    change(true);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("解除したら呼ばない", () => {
    const change = stubMatchMedia();
    const cb = vi.fn();
    onReducedMotion(cb)();
    change(true);
    expect(cb).not.toHaveBeenCalled();
  });

  it("matchMedia が無い環境でも落ちない", () => {
    expect(() => onReducedMotion(() => {})()).not.toThrow();
  });
});
