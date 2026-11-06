import { button, el } from "../ui/hud";
import { lastLogLine } from "./run-port";
import type { RunState } from "./run-port";

/** 稼働率・CPU・ターンの行。 */
export function statsRow(s: RunState): HTMLElement {
  const p = s.player;
  return el(
    "p",
    { class: "hud-row", "aria-label": "ステータス" },
    el("span", { class: "hud-stat" }, "稼働率 ", el("strong", {}, `${p.hp}/${p.maxHp}`)),
    el("span", { class: "hud-stat" }, "CPU ", el("strong", {}, `${p.cpu}/${p.cpuMax}`)),
    s.battle
      ? el("span", { class: "hud-stat" }, "ターン ", el("strong", {}, String(s.battle.turn)))
      : null,
    el(
      "span",
      { class: "hud-stat" },
      "階 ",
      el("strong", {}, String(s.floors[s.currentFloor - 1]?.number ?? 1)),
    ),
  );
}

/**
 * 直前の操作の結果・エラー。読み上げにも流す（role=status）。
 * エラーは core の lastError.message をそのまま出す（言い換えない）。
 */
export function logLine(s: RunState): HTMLElement {
  const p = el("p", { class: "hud-log", role: "status", "aria-live": "polite" });
  if (s.lastError) {
    p.classList.add("hud-danger");
    p.dataset.error = s.lastError.code;
    p.textContent = `✕ ${s.lastError.message}`;
  } else {
    const line = lastLogLine();
    if (line) p.textContent = line;
  }
  return p;
}

export function abandonButton(onAbandon: () => void): HTMLButtonElement {
  return button("ランを放棄", onAbandon, { label: "ランを放棄してリザルトへ" });
}
