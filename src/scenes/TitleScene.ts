import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { flags } from "../ui/flags";
import { button, el, renderHud } from "../ui/hud";
import { sceneFor, startRun } from "./run-port";
import { fadeIn, goTo } from "./transition";
import { TITLE } from "./BootScene";

/** 画面用のシード生成（ルール側ではないので crypto を使ってよい）。8桁の英数字。 */
export function newSeed(): string {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => n.toString(36).padStart(4, "0").slice(-4)).join("");
}

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  create(): void {
    fadeIn(this);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 48, TITLE, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#7ebeab",
      })
      .setOrigin(0.5);

    const input = el("input", {
      id: "seed-input",
      name: "seed",
      type: "text",
      inputmode: "latin",
      autocomplete: "off",
      spellcheck: "false",
      maxlength: "32",
    });
    input.value = flags().seed ?? newSeed();

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      const seed = input.value.trim() || newSeed();
      const s = startRun(seed);
      goTo(this, sceneFor(s));
    };
    const form = el(
      "form",
      { class: "hud-panel", "aria-label": "新しいラン" },
      el("h1", {}, "Log Dive"),
      el("p", {}, "障害の起きたサーバーのログに潜って、バグの正体を推理で突き止めよう。"),
      el(
        "div",
        { class: "hud-row" },
        el("label", { class: "hud-field", for: "seed-input" }, "シード"),
        input,
        button("ランダム", () => (input.value = newSeed()), { label: "シードをランダムにする" }),
      ),
      el("div", { class: "hud-row" }),
    );
    // Enter キーでも始められるよう form の submit で受ける（クリックも submit になる）
    const startBtn = button("新しいラン", () => {}, { primary: true });
    startBtn.type = "submit";
    startBtn.dataset.autofocus = "";
    form.lastElementChild?.append(startBtn);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      start();
    });
    renderHud("title", form);
  }
}
