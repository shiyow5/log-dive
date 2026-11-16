import { describe, expect, it } from "vitest";
import { loadGameData } from "../../src/core/data";
import { apply, initRun, type RunState } from "../../src/core/run";
import { defeatSummary, resultEnemyKind, resultRows } from "../../src/scenes/result-text";
import { symptomGuide } from "../../src/scenes/symptom-guide";

import { initFixedRun } from "./fixed-run";

const data = loadGameData();

describe("symptomGuide（#118）", () => {
  const g = symptomGuide(data);
  it("全バグ種が3症状ずつ並ぶ", () => {
    expect(g.rows).toHaveLength(5);
    for (const r of g.rows) expect(r.symptoms).toHaveLength(3);
  });
  it("「応答が遅い」はメモリリークと無限ループの2種だけ", () => {
    const x = g.shared.find((s) => s.symptom === "応答が遅い");
    expect(x?.bugNames).toEqual(["メモリリーク", "無限ループ"]);
  });
  it("共有症状は「応答が遅い」だけ（データ変更に気づく番人）", () => {
    expect(g.shared.map((s) => s.symptom)).toEqual(["応答が遅い"]);
  });
});

describe("defeatSummary（#118）", () => {
  const base = initRun("t118", data);
  it("ダウン以外は null", () => {
    expect(defeatSummary(base)).toBeNull();
    expect(defeatSummary({ ...base, phase: "won" })).toBeNull();
  });
  it("戦闘なしのダウンは null", () => {
    expect(defeatSummary({ ...base, phase: "lost", battle: null })).toBeNull();
  });
  it("最後のバグ・ボス・誤パッチ累計を返す", () => {
    const s = apply(initFixedRun("t118"), { t: "move", room: "r1" }, data);
    expect(s.phase).toBe("battle");
    const lost: RunState = { ...s, phase: "lost", stats: { ...s.stats, degrades: 3 } };
    expect(defeatSummary(lost)).toEqual({ bug: "off-by-one", boss: false, wrongPatches: 3 });
  });
});

describe("resultRows / resultEnemyKind（#95）", () => {
  const base = initRun("t95", data);
  it("指定値の4行（到達階・倒したバグ・使ったターン・今回のシード）。前回比は無い", () => {
    const s: RunState = { ...base, phase: "lost", stats: { bugsClosed: 2, turns: 7, degrades: 1 } };
    expect(resultRows(s)).toEqual([
      ["到達階", "1階"],
      ["倒したバグ", "2"],
      ["使ったターン", "7"],
      ["今回のシード", "t95"],
    ]);
  });
  it("背景の敵: クリアはボス・戦闘なしは通常のバグ・戦闘中はその部屋の敵", () => {
    expect(resultEnemyKind({ ...base, phase: "won" })).toBe("boss");
    expect(resultEnemyKind({ ...base, phase: "abandoned", battle: null })).toBe("bug");
    const s = apply(initFixedRun("t95"), { t: "move", room: "r1" }, data);
    expect(s.battle).not.toBeNull();
    expect(["bug", "blob", "ghost"]).toContain(resultEnemyKind({ ...s, phase: "lost" }));
  });
});
