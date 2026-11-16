import { describe, expect, it } from "vitest";
import { createHitHighlight, shouldHighlightBar } from "../../src/scenes/hit-highlight";

describe("createHitHighlight（#201）", () => {
  it("被弾後、200ms 以内の非ダメージ更新でも accent を保つ", () => {
    const hl = createHitHighlight();
    hl.hit();
    expect(shouldHighlightBar(false, hl)).toBe(true);
  });
  it("被弾していなければ danger（accent にしない）", () => {
    expect(shouldHighlightBar(false, createHitHighlight())).toBe(false);
  });
  it("release(その seq) 後は danger に戻る", () => {
    const hl = createHitHighlight();
    const s = hl.hit();
    expect(hl.release(s)).toBe(true);
    expect(hl.isActive()).toBe(false);
    expect(shouldHighlightBar(false, hl)).toBe(false);
  });
  it("連続被弾: 古い seq の release は false で active のまま、新しい seq で解除", () => {
    const hl = createHitHighlight();
    const s1 = hl.hit();
    const s2 = hl.hit();
    expect(hl.release(s1)).toBe(false);
    expect(hl.isActive()).toBe(true);
    expect(hl.release(s2)).toBe(true);
    expect(hl.isActive()).toBe(false);
  });
  it("reset() で active=false、前ランのタイマーも無効", () => {
    const hl = createHitHighlight();
    const s = hl.hit();
    hl.reset();
    expect(hl.isActive()).toBe(false);
    expect(hl.release(s)).toBe(false);
  });
});
