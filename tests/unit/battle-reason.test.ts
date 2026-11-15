import { describe, expect, it } from "vitest";
import type { RunErrorCode } from "../../src/core/run";
import { shortReason } from "../../src/scenes/battle-reason";

const CODES: RunErrorCode[] = [
  "run_over",
  "not_in_battle",
  "in_battle",
  "unknown_room",
  "not_adjacent",
  "skill_not_owned",
  "not_enough_cpu",
  "not_reproduced",
  "not_a_candidate",
  "missing_arg",
  "nothing_to_reveal",
  "too_few_candidates",
  "no_loot",
  "already_owned",
  "already_halted",
];

describe("shortReason (#94)", () => {
  it("未再現は「再現が必要」", () => {
    expect(shortReason("not_reproduced")).toBe("再現が必要");
  });

  it("どのコードも8字以内（空白は数えない）", () => {
    for (const c of CODES) {
      expect([...shortReason(c).replace(/\s/g, "")].length, c).toBeLessThanOrEqual(8);
    }
  });

  it("対応表にないコードは「使えない」", () => {
    expect(shortReason("run_over")).toBe("使えない");
  });
});
