import Phaser from "phaser";
import { button, el, renderHud } from "../ui/hud";
import { current } from "./run-port";
import type { RunStatus } from "./run-port";
import { fadeIn, goTo } from "./transition";

const HEADLINE: Record<RunStatus, string> = {
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
    fadeIn(this);
    const s = current();
    const rows: [string, string][] = [
      ["閉じたバグ票", String(s.closedBugs)],
      ["ターン数", String(s.turn)],
      ["デグレ回数", String(s.degrades)],
      ["シード", s.seed],
    ];
    const panel = el(
      "section",
      { class: "hud-panel", "aria-label": "リザルト" },
      el("h1", { class: s.status === "won" ? "hud-ok" : "hud-danger" }, HEADLINE[s.status]),
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
