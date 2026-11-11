import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FX_MAP } from "../../src/fx/fx-map";
import { dispatch, lastLogLine, startRun } from "../../src/scenes/run-port";
import type { Action } from "../../src/scenes/run-port";
import { STORY } from "../../src/scenes/story-text";

const plan = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../e2e/fixtures/full-run-plan.json", import.meta.url)),
    "utf8",
  ),
) as { seed: string; steps: { action: Action }[] };

describe("ボス戦の物語文言（#128）", () => {
  it("登場ログ・1回目パッチ後の一言・クリア文言が出し分けられる", () => {
    let s = startRun(plan.seed);
    const bossLogs: string[] = [];
    let normalBattleStartLog: string | null = null;
    for (const step of plan.steps) {
      s = dispatch(step.action);
      if (s.phase === "battle" && s.battle?.boss) bossLogs.push(lastLogLine() ?? "");
      else if (s.phase === "battle" && step.action.t === "move" && !normalBattleStartLog) {
        normalBattleStartLog = lastLogLine();
      }
    }
    expect(s.phase).toBe("won");
    expect(normalBattleStartLog).toMatch(/バグが出た$/);
    expect(bossLogs[0]).toMatch(new RegExp(`${STORY.bossAppear}$`));
    expect(bossLogs.some((l) => l.includes(`バグに 20 ダメージ\n${STORY.bossPatched}`))).toBe(true);
  });

  it("文言は1か所（story-text）の関数で組み立てる", () => {
    expect(STORY.bossTitle).toBe("根本原因 #BUG-000 — 正体不明のバグ");
    expect(STORY.bossPatched).toBe("効いた。でも、根が残っている。");
    expect(STORY.bossDegrade(5)).toBe("外した。根が、さらに深く潜った。(HP +5)");
    expect(STORY.bossDegrade(0)).toBe("外した。根が、さらに深く潜った。");
    expect(STORY.clearStatsHeading(7)).toBe("全バグ票 7 件クローズ");
  });

  it("fumino v1.0: 1行32字以内・1枠3行以内", () => {
    const texts = [
      STORY.bossTitle,
      STORY.bossAppear,
      `バグに 20 ダメージ\n${STORY.bossPatched}`,
      STORY.bossDefeated,
      `デグレ！ ${STORY.bossDegrade(5)}\n${STORY.bossStuckHint}`,
      STORY.clearEpilogue,
      STORY.clearStatsHeading(8),
      STORY.clearCoda,
    ];
    for (const t of texts) {
      const lines = t.split("\n");
      expect(lines.length).toBeLessThanOrEqual(3);
      for (const l of lines) expect([...l].length).toBeLessThanOrEqual(32);
    }
  });

  it("クリア演出に LEVEL UP! は含めない（このゲームにレベルアップは無い）", () => {
    const names = FX_MAP.result.map((f) =>
      JSON.stringify((f.mod as { meta?: unknown }).meta ?? ""),
    );
    expect(FX_MAP.result).toHaveLength(1);
    expect(names.join()).not.toMatch(/level/i);
  });
});
