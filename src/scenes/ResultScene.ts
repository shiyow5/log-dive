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
    createSceneFx(this, "fx-result").emitRunEvents(s.events);
    const rows: [string, string][] = [
      ["閉じたバグ票", String(s.stats.bugsClosed)],
      ["ターン数", String(s.stats.turns)],
      ["デグレ回数", String(s.stats.degrades)],
      ["シード", s.seed],
    ];
    const panel = el(
      "section",
      { class: "hud-panel", "aria-label": "リザルト" },
      el("h1", { class: s.phase === "won" ? "hud-ok" : "hud-danger" }, HEADLINE[s.phase]),
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
