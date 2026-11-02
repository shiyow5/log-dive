/**
 * LD-30（log-dive #6）: シード入力の境界。src/core/rng.ts の seedFrom / Rng を直接使う。
 *
 * - どの入力でも例外を出さない
 * - 同じ入力なら同じ列、違う入力なら違う列（決定的）
 * - seedFrom は String(seed) なので 123 と "123" は同じ
 *
 * 前後の空白を削るか・全角数字を半角にするか（L-U5）は未決。rng.ts は入力をそのまま使うので、
 * 今は " 1" と "1"、"１" と "1" が「違う列」になることを固定しておく。
 * 正規化を入れる場合は UI 側（タイトルのシード入力）でやる想定で、ここは変えない。
 */
import { describe, expect, it } from "vitest";
import { Rng, seedFrom } from "../../src/core/rng";

const N = 32;

function seq(seed: string | number, n = N): number[] {
  const r = new Rng(seed);
  return Array.from({ length: n }, () => r.nextU32());
}

const BOUNDARY: ReadonlyArray<readonly [string, string]> = [
  ["空文字", ""],
  ["前に空白", " 1"],
  ["後ろに空白", "1 "],
  ["半角 1", "1"],
  ["全角 １", "１"],
  ["+ を含む", "a+b"],
  ["空白を含む", "a b"],
  ["絵文字（サロゲートペア）", "🐛"],
  ["絵文字＋結合文字", "👩‍💻"],
  ["対になっていないサロゲート", "\uD800"],
  ["1万文字", "x".repeat(10_000)],
  ["1万文字＋1", "x".repeat(10_000) + "y"],
];

describe("LD-30 シード入力の境界（rng.ts）", () => {
  it.each(BOUNDARY)("%s: 例外なく、32bit の初期値4つと [0,1) の値を作る", (_label, seed) => {
    expect(() => seedFrom(seed)).not.toThrow();
    const st = seedFrom(seed);
    for (const v of [st.a, st.b, st.c, st.d]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
    const r = new Rng(seed);
    for (let i = 0; i < 100; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it.each(BOUNDARY)("%s: 同じ入力を2回使うと同じ列になる", (_label, seed) => {
    expect(seq(seed)).toEqual(seq(seed));
  });

  it("境界の入力どうしはすべて違う列になる", () => {
    const heads = BOUNDARY.map(([, s]) => seq(s, 4).join(","));
    expect(new Set(heads).size).toBe(BOUNDARY.length);
  });

  it('123（数値）と "123"（文字列）は同じ初期値・同じ列', () => {
    expect(seedFrom(123)).toEqual(seedFrom("123"));
    expect(seq(123)).toEqual(seq("123"));
  });

  it('数値の境界: 0 と "0"、-1 と "-1"、1.5 と "1.5" は同じ。0 と "" は違う', () => {
    for (const n of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      expect(seq(n)).toEqual(seq(String(n)));
    }
    expect(seq(0)).not.toEqual(seq(""));
  });

  it("L-U5 未決のあいだの現状: 前後の空白・全角は正規化されない（別の列になる）", () => {
    expect(seq(" 1")).not.toEqual(seq("1"));
    expect(seq("1 ")).not.toEqual(seq("1"));
    expect(seq("１")).not.toEqual(seq("1"));
  });

  it("1万文字のシードでも 200ms 以内に初期化できる（タイトル入力で固まらない）", () => {
    const long = "🐛".repeat(10_000);
    const t0 = performance.now();
    seedFrom(long);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it("既知の値に固定（境界の入力の先頭値。rng.ts を変えたら気づけるように）", () => {
    expect(Object.fromEntries(BOUNDARY.map(([label, s]) => [label, seq(s, 2)]))).toMatchSnapshot();
  });
});
