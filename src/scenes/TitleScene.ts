import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { loadGameData } from "../core/data";
import { flags } from "../ui/flags";
import { button, el, renderHud } from "../ui/hud";
import { sceneFor, skillInfo, startRun } from "./run-port";
import { fadeIn, goTo } from "./transition";
import { TITLE } from "./BootScene";

// ---- 遊び方モーダル ----

let helpOpen = false;

// 説明の数値・名前はデータから引く（直書きするとデータ変更で嘘になる）
const data = loadGameData();
const CPU_PER_TURN = data.player.cpuPerTurn;
const hotfix = skillInfo("hotfix");
const patch = skillInfo("patch");
const starters = data.skills.skills
  .filter((k) => k.starter)
  .map((k) => k.name)
  .join("・");
const chestSkills = data.skills.skills
  .filter((k) => !k.starter)
  .map((k) => k.name)
  .join("・");

function onHelpKey(e: KeyboardEvent): void {
  if (e.key === "Escape") closeHelp();
}

/** 遊び方パネルを閉じる（閉じるボタン・Esc 共通）。 */
function closeHelp(): void {
  document.getElementById("help-overlay")?.remove();
  document.removeEventListener("keydown", onHelpKey);
  helpOpen = false;
}

/** 遊び方パネルのDOM要素を作成して返す。 */
function createHelpPanel(): HTMLElement {
  return el(
    "div",
    {
      id: "help-overlay",
      style:
        "position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:100;pointer-events:auto;",
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
        "各部屋にはバグが潜んでいる。戦闘で症状（例:「配列の端で落ちる」→境界ずれ）を見て、ログから候補を絞り、パッチで撃破する。CPU を使い切りすぎると負けるから、症状から当ててCPUを節約しよう。",
      ),
      el(
        "p",
        {},
        `CPU＝サーバーの処理能力（毎ターン ${CPU_PER_TURN}）。${hotfix.name}は即席の応急処置（CPU ${hotfix.cpu}、少しだけ削る）、${patch.name}は完全修正（CPU ${patch.cpu}、種類を当てる必要がある）。`,
      ),
      el(
        "p",
        {},
        "マップ記号: ▼階段（開いている） ◆階段（閉じている） ♦宝箱 ▲ボス(バグあり) ★ボス(クリア) ×バグ(あり) ✓バグ(クリア)",
      ),
      el("p", {}, `最初から${starters}を使える。宝箱を開けると${chestSkills}が増える。`),
      button("閉じる", () => closeHelp()),
    ),
  );
}

/** 遊び方パネルを開く。TitleSceneでのみ有効。 */
export function openHelp(): void {
  if (helpOpen) return;
  helpOpen = true;
  const overlay = createHelpPanel();
  document.getElementById("hud")?.append(overlay);
  document.addEventListener("keydown", onHelpKey);
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
    );
    // Enter キーでも始められるよう form の submit で受ける（クリックも submit になる）
    const startBtn = button("新しいラン", () => {}, { primary: true });
    startBtn.type = "submit";
    startBtn.dataset.autofocus = "";
    // 「新しいラン」と「遊び方」は同じ行に並べる（遊び方は type=button なので submit しない）
    form.append(
      el(
        "div",
        { class: "hud-row" },
        startBtn,
        button("遊び方", () => openHelp()),
      ),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      start();
    });
    renderHud("title", form);
  }
}
