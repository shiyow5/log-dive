import { describe, expect, it } from "vitest";
import { loadGameData } from "../../src/core/data";
import { apply, initRun, type RunState } from "../../src/core/run";
import { defeatHint, defeatSummary } from "../../src/scenes/result-text";
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
  it("ヒントは誤パッチ0回かどうかで変わる", () => {
    expect(defeatHint({ bug: "race", boss: false, wrongPatches: 0 })).not.toBe(
      defeatHint({ bug: "race", boss: false, wrongPatches: 2 }),
    );
  });
});
