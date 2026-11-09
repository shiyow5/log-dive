import Phaser from "phaser";
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH } from "../config";
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
/** スキル名・CPU・ダメージ（skills.json）。 */
function skillText(id: "hotfix" | "patch"): { name: string; cpu: number; damage: number } {
  const def = data.skills.skills.find((k) => k.id === id);
  const damage = def && "damage" in def.effect ? def.effect.damage : 0;
  return { ...skillInfo(id), damage };
}
const hotfix = skillText("hotfix");
const patch = skillText("patch");
const MAP_LEGEND = [
  "▼ 階段（開いている。入ると次の階へ）",
  "◆ 階段（バグが残っていて進めない）",
  "♦ 宝箱",
  "▲ 根本原因（未解決）",
  "★ 根本原因（解決済み）",
  "× バグあり",
  "✓ 解決済み",
];
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
      el(
        "p",
        {},
        "3階の奥にいる根本原因（ボス）に修正パッチを当てて、障害の起きたサーバーを復旧しよう。稼働率（HP）が 0 になるとダウンして負け。",
      ),
      el(
        "p",
        {},
        "各部屋にはバグが潜んでいる。戦闘では症状（例:「配列の端で落ちる」→境界ずれ）とログから正体を絞り、修正パッチで直す。種類を外すとバグが悪化する。",
      ),
      el(
        "p",
        {},
        `CPU は1ターンに使える行動力（毎ターン ${CPU_PER_TURN}）。${hotfix.name}は応急処置（CPU ${hotfix.cpu}・ダメージ ${hotfix.damage}）、${patch.name}は完全修正（CPU ${patch.cpu}・ダメージ ${patch.damage}。種類を当てる必要がある）。`,
      ),
      el("p", {}, `最初から${starters}を使える。宝箱を開けると${chestSkills}が増える。`),
      el("p", {}, "マップ記号:"),
      el("ul", { "aria-label": "マップ記号" }, ...MAP_LEGEND.map((line) => el("li", {}, line))),
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
        fontFamily: FONT_FAMILY,
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
