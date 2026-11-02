import { button, el } from "../ui/hud";
import type { RunState } from "./run-port";

/** 稼働率・CPU・ターンの行。 */
export function statsRow(s: RunState): HTMLElement {
  return el(
    "p",
    { class: "hud-row", "aria-label": "ステータス" },
    el("span", { class: "hud-stat" }, "稼働率 ", el("strong", {}, `${s.hp}/${s.maxHp}`)),
    el("span", { class: "hud-stat" }, "CPU ", el("strong", {}, `${s.cpu}/${s.maxCpu}`)),
    el("span", { class: "hud-stat" }, "ターン ", el("strong", {}, String(s.turn))),
    el("span", { class: "hud-stat" }, "階 ", el("strong", {}, String(s.floor))),
  );
}

/** 直前の操作の結果・エラー。読み上げにも流す（role=status）。 */
export function logLine(s: RunState): HTMLElement {
  const p = el("p", { class: "hud-log", role: "status", "aria-live": "polite" });
  if (s.lastError) {
    p.classList.add("hud-danger");
    p.textContent = `✕ ${s.lastError}`;
  } else if (s.lastEvent) {
    p.textContent = s.lastEvent;
  }
  return p;
}

export function abandonButton(onAbandon: () => void): HTMLButtonElement {
  return button("ランを放棄", onAbandon, { label: "ランを放棄してリザルトへ" });
}
