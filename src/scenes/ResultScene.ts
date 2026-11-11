import { STORY } from "./story-text";
import Phaser from "phaser";
import { setupView } from "./view";
import { createSceneFx } from "../fx/scene-fx";
import { button, el, renderHud } from "../ui/hud";
import { current } from "./run-port";
import type { RunPhase } from "./run-port";
import { fadeIn, goTo } from "./transition";

const HEADLINE: Record<RunPhase, string> = {
  won: "復旧完了",
  lost: "稼働率 0 — ダウン",
  abandoned: "ランを放棄した",
  map: "",
  battle: "",
};

/** リザルト（数値表示のみ。曲線は完成版 = spec-a v0.2 §12）。 */
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
    const rows: [string, string][] = [
      ["閉じたバグ票", String(s.stats.bugsClosed)],
      ["ターン終了の回数", String(s.stats.turns)],
      ["デグレ回数", String(s.stats.degrades)],
      ["シード", s.seed],
    ];
    const panel = el(
      "section",
      { class: "hud-panel", "aria-label": "リザルト" },
      el("h1", { class: s.phase === "won" ? "hud-ok" : "hud-danger" }, HEADLINE[s.phase]),
      s.phase === "won" ? el("p", { class: "hud-ok" }, STORY.clearEpilogue) : null,
      s.phase === "won"
        ? el("h2", { class: "hud-stat" }, STORY.clearStatsHeading(s.stats.bugsClosed))
        : null,
      el(
        "dl",
        { class: "hud-dl" },
        ...rows.flatMap(([k, v]) => [
          el("dt", { class: "hud-stat" }, k),
          el("dd", { "data-testid": `result-${k}` }, v),
        ]),
      ),
      el(
        "div",
        { class: "hud-row" },
        button("タイトルへ", () => goTo(this, "title"), { primary: true }),
      ),
    );
    renderHud("result", panel);
  }
}
