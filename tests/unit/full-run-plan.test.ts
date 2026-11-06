/**
 * 通し e2e（e2e/full-run.spec.ts）の手順表を core/run.ts から作る。
 * Playwright は src/core（JSON import を含む）を直接読めないので、手順と各手の後の stateHash を
 * e2e/fixtures/full-run-plan.json に書き出し、e2e はそれをボタン操作に置き換えて再生する。
 *
 * ルールを変えて手順が変わったら: UPDATE_E2E_PLAN=1 npx vitest run tests/unit/full-run-plan.test.ts && npx prettier --write e2e/fixtures
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bugDef, loadGameData, skillDef } from "../../src/core/data";
import { stateHash } from "../../src/core/hash";
import { apply, initRun, type Action, type RunState } from "../../src/core/run";
import { oracleAction } from "../qa/oracle";

const FULL_RUN_SEED = "e2e-full-1";
const PLAN_PATH = fileURLToPath(new URL("../../e2e/fixtures/full-run-plan.json", import.meta.url));
const data = loadGameData();

/** e2e が押すボタン（アクセシブルネーム）。move は前方一致で使う。 */
type Press =
  | { readonly kind: "move"; readonly name: string }
  | { readonly kind: "button"; readonly names: readonly string[] };

interface Step {
  readonly action: Action;
  readonly press: Press;
  readonly scene: "map" | "battle" | "result";
  readonly floor: number;
  readonly hash: string;
}

function toPress(a: Action): Press {
  switch (a.t) {
    case "move":
      return { kind: "move", name: `${a.room}へ移動` };
    case "loot":
      return { kind: "button", names: [`宝箱を開ける: ${skillDef(data, a.pick).name}`] };
    case "skill": {
      const k = skillDef(data, a.id);
      const names = [`${k.name}（CPU ${k.cpu}）`];
      if (a.id === "patch" && a.arg) names.push(`パッチを当てる: ${bugDef(data, a.arg).name}`);
      return { kind: "button", names };
    }
    case "endTurn":
      return { kind: "button", names: ["ターン終了"] };
    case "abandon":
      throw new Error("通し e2e では放棄しない");
  }
}

const sceneOf = (s: RunState): Step["scene"] =>
  s.phase === "map" ? "map" : s.phase === "battle" ? "battle" : "result";

function buildPlan() {
  let s = initRun(FULL_RUN_SEED);
  const initialHash = stateHash(s);
  const steps: Step[] = [];
  for (let i = 0; i < 500 && s.phase !== "won" && s.phase !== "lost"; i++) {
    const action = oracleAction(s);
    const next = apply(s, action);
    if (next.lastError) throw new Error(`#${i} ${JSON.stringify(action)}: ${next.lastError.code}`);
    steps.push({
      action,
      press: toPress(action),
      scene: sceneOf(next),
      floor: next.floor.number,
      hash: stateHash(next),
    });
    s = next;
  }
  return { seed: FULL_RUN_SEED, initialHash, finalPhase: s.phase, steps };
}

describe("通し e2e の手順表", () => {
  const plan = buildPlan();

  it("BOT は1→2→3階を通ってボスを倒す（won）", () => {
    expect(plan.finalPhase).toBe("won");
    expect([...new Set(plan.steps.map((x) => x.floor))]).toEqual([1, 2, 3]);
    expect(plan.steps.at(-1)?.scene).toBe("result");
  });

  it("e2e/fixtures/full-run-plan.json が core の今の結果と一致する", () => {
    const json = `${JSON.stringify(plan, null, 2)}\n`;
    if (process.env.UPDATE_E2E_PLAN === "1") writeFileSync(PLAN_PATH, json);
    // 整形（prettier）に左右されないよう、文字列ではなく中身で比べる
    expect(
      JSON.parse(readFileSync(PLAN_PATH, "utf8")),
      "手順表が古い: UPDATE_E2E_PLAN=1 npx vitest run tests/unit/full-run-plan.test.ts",
    ).toEqual(JSON.parse(json));
  });
});
