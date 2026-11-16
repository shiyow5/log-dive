import { describe, expect, it } from "vitest";
import { createFrame, clearFrame, createFx } from "pixelfx";
import * as titleBg from "../../src/fx/title-bg";
import { LOGO_BAND, flyPos, logToken, makeFlies } from "../../src/fx/title-bg";
import { FX_MAP } from "../../src/fx/fx-map";

describe("タイトル背景（Issue #110）", () => {
  it("fx-map の title は桜を使わず、背景モジュール 1 本だけ", () => {
    expect(FX_MAP.title).toHaveLength(1);
    expect(FX_MAP.title[0]?.mod).toBe(titleBg);
  });

  it("蛍はロゴ禁止帯に入らない（全時刻・複数シード、グロー半径 8 の余白込み）", () => {
    for (const seed of [1, 2, 3, 99]) {
      for (const f of makeFlies(seed)) {
        for (let t = 0; t < 24; t += 0.25) {
          const [, y] = flyPos(f, t);
          expect(y - 8).toBeGreaterThan(LOGO_BAND.y1);
        }
      }
    }
    expect(makeFlies(3).length).toBeLessThanOrEqual(10);
  });

  it("ログ文字の列はロゴ禁止帯の x 範囲(80〜240)に重ならない", () => {
    const fx = createFx(titleBg, { x: 0, y: 0 });
    const frame = createFrame(320, 180);
    for (const t of [0, 3.3, 10, 17.9]) {
      clearFrame(frame);
      fx.update(t === 0 ? 0 : 0.5);
      fx.draw(frame, "back");
      // 背景グラデは全面に出るので、「文字っぽい明るい点」だけを見る: 帯内の色は帯の最上端行と同じ系統で、
      // 蛍の光(light)以外に body/stamp/emph 色が無いことを確認する
      for (let y = LOGO_BAND.y0; y < LOGO_BAND.y1; y++) {
        const bg = frame.color[y * 320 + 100] as number;
        for (let x = LOGO_BAND.x0; x < LOGO_BAND.x1; x++) {
          expect(frame.color[y * 320 + x]).toBe(bg);
        }
      }
    }
  });

  it("ログ文字は決定的", () => {
    expect(logToken(0, 3)).toBe(logToken(0, 3));
    expect(logToken(0, 3)).toMatch(/^\d\d:\d\d$/);
  });
});
