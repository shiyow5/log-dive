import { describe, expect, it } from "vitest";
import { MemoryStorage, type KeyValueStorage } from "../../src/core/save";
import {
  PREV_RUN_KEY,
  diffOf,
  loadPrevRun,
  prevRunStore,
  resultDiffs,
  savePrevRun,
  takePrevRun,
} from "../../src/scenes/prev-run";

const rec = (floor: number, bugsClosed: number, turns: number) => ({ floor, bugsClosed, turns });

describe("前回ランの保存と読み出し（#95）", () => {
  it("保存した1件をそのまま読み戻せる（上書きで常に1件）", () => {
    const st = new MemoryStorage();
    const store = prevRunStore(st);
    savePrevRun(store, rec(2, 3, 40));
    savePrevRun(store, rec(4, 5, 60));
    expect(loadPrevRun(store)).toEqual(rec(4, 5, 60));
  });

  it("記録なしは null", () => {
    expect(loadPrevRun(prevRunStore(new MemoryStorage()))).toBeNull();
  });

  it("壊れた JSON・チェックサム不一致・形の違うデータは null（例外にしない）", () => {
    const st = new MemoryStorage();
    const store = prevRunStore(st);
    st.setItem(PREV_RUN_KEY, "{not json");
    expect(loadPrevRun(store)).toBeNull();
    savePrevRun(store, rec(2, 3, 40));
    st.setItem(PREV_RUN_KEY, (st.getItem(PREV_RUN_KEY) ?? "").replace('"floor":2', '"floor":9'));
    expect(loadPrevRun(store)).toBeNull();
    // チェックサムは合うが中身が数値でない
    prevRunStore(st).save({ floor: "x", bugsClosed: -1, turns: 1.5 } as never);
    expect(loadPrevRun(store)).toBeNull();
  });

  it("ストレージが例外を投げても読み書きは例外にならない", () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    const store = prevRunStore(broken);
    expect(() => savePrevRun(store, rec(1, 0, 0))).not.toThrow();
    expect(loadPrevRun(store)).toBeNull();
    expect(takePrevRun(900, rec(1, 0, 0), broken)).toBeNull();
  });
});

describe("前回比の符号（#95）", () => {
  it("増は +、減は −(U+2212)、同じは ±0。単位は指定どおり「+2 階」の形", () => {
    expect(diffOf(5, 3, "階")).toEqual({ text: "+2 階", tone: "up" });
    expect(diffOf(2, 3)).toEqual({ text: "−1", tone: "down" });
    expect(diffOf(3, 3)).toEqual({ text: "±0", tone: "same" });
  });

  it("前回記録が無ければ前回比を出さない", () => {
    expect(resultDiffs(rec(1, 0, 0), null)).toEqual({});
  });

  it("結果表の3行に前回比が付き、シードには付かない", () => {
    const d = resultDiffs(rec(3, 2, 30), rec(1, 3, 30));
    expect(Object.keys(d)).toEqual(["到達階", "倒したバグ", "使ったターン"]);
    expect(d["到達階"]?.text).toBe("+2");
    expect(d["倒したバグ"]?.text).toBe("−1");
    expect(d["使ったターン"]?.text).toBe("±0");
  });
});

describe("takePrevRun（リザルトを開いたとき）", () => {
  it("前回を返して今回で上書き。同じランで作り直しても自分自身とは比べない", () => {
    const st = new MemoryStorage();
    expect(takePrevRun(1, rec(1, 0, 5), st)).toBeNull();
    expect(takePrevRun(1, rec(1, 0, 5), st)).toBeNull();
    expect(takePrevRun(2, rec(3, 2, 20), st)).toEqual(rec(1, 0, 5));
    expect(takePrevRun(2, rec(3, 2, 20), st)).toEqual(rec(1, 0, 5));
    expect(loadPrevRun(prevRunStore(st))).toEqual(rec(3, 2, 20));
  });
});
