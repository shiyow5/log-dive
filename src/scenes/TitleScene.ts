import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { flags } from "../ui/flags";
import { button, el, renderHud } from "../ui/hud";
import { sceneFor, startRun } from "./run-port";
import { fadeIn, goTo } from "./transition";
import { TITLE } from "./BootScene";

// ---- 遊び方モーダル ----

let helpOpen = false;

/** 遊び方パネルのDOM要素を作成して返す。 */
function createHelpPanel(): HTMLElement {
  return el(
    "div",
    {
      id: "help-overlay",
      style:
        "position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:100;",
      "data-scene": "help",
    },
    el(
      "div",
      {
        style:
          "background:#1b2b2e;border:1px solid #7ebeab;border-radius:8px;padding:20px 24px;max-width:480px;width:90%;color:#e4f1ec;font-size:13px;line-height:1.6;",
      },
      el("h2", { style: "margin:0 0 12px;color:#7ebeab;font-size:16px;" }, "遊び方"),
      el("p", {}, "3階のボスを倒して、稼働率0でダウンしたサーバーを復旧しよう。"),
      el(
        "p",
        {},
        "各部屋にはバグが潜んでいる。戦闘で症状（例:「配列の端で落ちる」→境界ずれ）を見て、ログから候補を絞り、パッチで撃破する。CPU（1ターン3）を使い切りすぎると負けるから、症状から当ててCPUを節約しよう。",
      ),
      el(
        "p",
        {},
        "CPU＝サーバーの処理能力。ホットフィックスは即席の応急処置（CPU3、不完全）、パッチは完全修正（CPU20、正解が必要）。",
      ),
      el(
        "p",
        {},
        "マップ記号: ▼階段（開いている） ◆階段（閉じている） ♦宝箱 ▲ボス(バグあり) ★ボス(クリア) ×バグ(あり) ✓バグ(クリア)",
      ),
      el(
        "p",
        {},
        "宝箱に入っているスキル（再現・ログ確認・ホットフィックス・パッチ）を使って戦う。",
      ),
      button("閉じる", () => {
        const overlay = document.getElementById("help-overlay");
        if (overlay) overlay.remove();
        helpOpen = false;
      }),
    ),
  );
}

/** 遊び方パネルを開く。TitleSceneでのみ有効。 */
export function openHelp(): void {
  if (helpOpen) return;
  helpOpen = true;
  const overlay = createHelpPanel();
  document.getElementById("hud")?.append(overlay);

  // Escで閉じる
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && helpOpen) {
      const o = document.getElementById("help-overlay");
      if (o) o.remove();
      helpOpen = false;
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);
}

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
      button("遊び方", () => openHelp()),
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
