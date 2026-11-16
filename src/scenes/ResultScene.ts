import { STORY } from "./story-text";
import Phaser from "phaser";
import { setupView } from "./view";
import { createSceneFx } from "../fx/scene-fx";
import { button, el, renderHud } from "../ui/hud";
import { bugName, current, runSerial, sceneFor, startRun } from "./run-port";
import { browserStorage, recordOf, resultDiffs, takePrevRun } from "./prev-run";
import { enemySpriteDataUrl } from "../art/enemy-sprites";
import { RESULT_HINT, defeatSummary, resultEnemyKind, resultRows } from "./result-text";
import type { RunPhase } from "./run-port";
import { fadeIn, goTo } from "./transition";

const HEADLINE: Record<RunPhase, string> = {
  won: "復旧完了",
  lost: "稼働率 0 — ダウン",
  abandoned: "ランを放棄した",
  map: "",
  battle: "",
};

/** リザルト（数値表示のみ。曲線は完成版 = spec-a v0.2 §12）。レイアウトは #95 の指定値。 */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super("result");
  }

  create(): void {
    setupView(this);
    fadeIn(this);
    const s = current();
    // リザルトで鳴らすのは「復旧完了」の演出だけ。s.events には最終戦闘の演出（撃破の爆発・紙吹雪・
    // バグ出現の雷など）が残っているので、まるごと再生すると戦闘の絵がリザルトに映ってしまう（#122）。
    const fx = createSceneFx(this, "fx-result");
    if (s.phase === "won") fx.emit("result");
    const defeat = defeatSummary(s);
    const retry = () => {
      const next = startRun(s.seed);
      goTo(this, sceneFor(next));
    };
    // #95 指定値(minori 11/10 14:14): 見出し → 結果表 → 一言ヒント → 主「同じシードでもう一度」/副「タイトルへ」。
    // 背景に敵ドット絵を薄く（パネル背面中央）。前回比は値の右に小さく（rei 判断 11/17）。
    const cur = recordOf(s);
    const diffs = resultDiffs(cur, takePrevRun(runSerial(), cur, browserStorage()));
    const sprite = enemySpriteDataUrl(resultEnemyKind(s));
    const panel = el(
      "section",
      { class: "hud-panel result-panel", "aria-label": "リザルト" },
      sprite
        ? el("img", {
            class: "result-sprite",
            src: sprite,
            alt: "",
            "aria-hidden": "true",
            "data-testid": "result-sprite",
          })
        : null,
      el("h1", { class: s.phase === "won" ? "hud-ok" : "hud-danger" }, HEADLINE[s.phase]),
      s.phase === "won" ? el("p", { class: "hud-ok hud-lines" }, STORY.clearEpilogue) : null,
      s.phase === "won"
        ? el("h2", { class: "hud-stat" }, STORY.clearStatsHeading(s.stats.bugsClosed))
        : null,
      defeat
        ? el(
            "div",
            { class: "result-defeat", "data-testid": "result-defeat" },
            el("p", {}, `最後のバグ: ${bugName(defeat.bug)}${defeat.boss ? "（ボス）" : ""}`),
            el("p", {}, `誤パッチ: ${defeat.wrongPatches}回`),
          )
        : null,
      el(
        "dl",
        { class: "result-table" },
        ...resultRows(s).map(([k, v]) =>
          el(
            "div",
            { class: "result-row" },
            el("dt", {}, k),
            el(
              "dd",
              {},
              el("span", { "data-testid": `result-${k}` }, v),
              diffs[k]
                ? el(
                    "span",
                    {
                      class: `result-diff result-diff--${diffs[k].tone}`,
                      "data-testid": `result-diff-${k}`,
                    },
                    el("span", { class: "visually-hidden" }, "前回比 "),
                    diffs[k].text,
                  )
                : null,
            ),
          ),
        ),
      ),
      s.phase === "won"
        ? el("p", { class: "hud-ok" }, STORY.clearCoda)
        : el("p", { class: "result-hint", "data-testid": "result-hint" }, RESULT_HINT),
      el(
        "div",
        { class: "result-actions" },
        button("同じシードでもう一度", retry, { primary: true }),
        button("タイトルへ", () => goTo(this, "title")),
      ),
    );
    renderHud("result", panel);
  }
}
