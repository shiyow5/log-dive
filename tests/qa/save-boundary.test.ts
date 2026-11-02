/**
 * LD-03 の残り（log-dive #6）: 空文字と未来の版のセーブ。
 *
 * 壊れた JSON・sum 不一致・data/sum 欠損は tests/unit/save.test.ts（#2）で確認済み。
 * ここでは「例外を出さず ok:false を返す（＝タイトルへ戻れる）」ことを確かめる。
 * 未来の版（v=2）は Issue #6 の受け入れ範囲「corrupt か version」のうち、
 * 今の実装の挙動（version）を固定する。仕様で corrupt に決まったらここを直す。
 */
import { describe, expect, it } from "vitest";
import { MemoryStorage, SaveStore } from "../../src/core/save";

type Data = { n: number };

function storeWith(raw: string | null, version = 1) {
  const st = new MemoryStorage();
  if (raw !== null) st.setItem("k", raw);
  return { st, s: new SaveStore<Data>(st, "k", version) };
}

describe("LD-03 壊れたセーブの残り（空文字・未来の版）", () => {
  it("空文字のセーブは例外にせず corrupt", () => {
    const { s } = storeWith("");
    expect(() => s.load()).not.toThrow();
    expect(s.load()).toEqual({ ok: false, reason: "corrupt" });
  });

  it.each([" ", "\n", "null", "1", "[]", '"save"', '{"v":"1"}', "{}"])(
    "JSON として読めても封筒の形でない %j は corrupt",
    (raw) => {
      const { s } = storeWith(raw);
      expect(() => s.load()).not.toThrow();
      expect(s.load()).toEqual({ ok: false, reason: "corrupt" });
    },
  );

  it("未来の版（v=2 で正しく保存されたもの）を v=1 で読むと例外にせず version", () => {
    const st = new MemoryStorage();
    new SaveStore<Data>(st, "k", 2).save({ n: 1 });
    const s = new SaveStore<Data>(st, "k", 1);
    expect(() => s.load()).not.toThrow();
    const r = s.load();
    expect(r.ok).toBe(false);
    expect(r).toEqual({ ok: false, reason: "version" });
  });

  it('未来の版で data/sum が欠けている（{"v":2}）ものは corrupt', () => {
    const { s } = storeWith('{"v":2}');
    expect(s.load()).toEqual({ ok: false, reason: "corrupt" });
  });

  it("migrate があっても未来の版には migrate を呼ばない", () => {
    const st = new MemoryStorage();
    new SaveStore<Data>(st, "k", 2).save({ n: 1 });
    let called = 0;
    const s = new SaveStore<Data>(st, "k", 1, () => {
      called++;
      return { n: 99 };
    });
    expect(s.load()).toEqual({ ok: false, reason: "version" });
    expect(called).toBe(0);
  });

  it("読めなかったあとに上書き保存すれば読み直せる（タイトルから新規開始できる）", () => {
    const { s } = storeWith("");
    expect(s.load().ok).toBe(false);
    s.save({ n: 3 });
    expect(s.load()).toEqual({ ok: true, data: { n: 3 } });
  });
});
