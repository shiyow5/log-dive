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
    el("span", { class: "hud-stat" }, "階 ", el("strong", {}, String(s.floor.number))),
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

/**
 * 「ランを放棄…」。危険操作なので主操作から離し、ゴースト表示にする（#119）。
 * 押しても即放棄せず、確認ダイアログ（続けるが初期フォーカス）を出す。
 */
export function abandonButton(onAbandon: () => void): HTMLButtonElement {
  const b = button("ランを放棄…", () => openAbandonConfirm(onAbandon, b), {
    label: "ランを放棄…（確認が出ます）",
  });
  b.classList.add("hud-btn--ghost", "hud-abandon");
  return b;
}

/** 確認ダイアログを開く。Esc・「続ける」で閉じて元のボタンにフォーカスを戻す。 */
export function openAbandonConfirm(onAbandon: () => void, opener?: HTMLElement): void {
  if (document.getElementById("abandon-confirm")) return;
  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    document.getElementById("abandon-confirm")?.remove();
    if (opener?.isConnected) opener.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      // フォーカスをダイアログ内に閉じ込める
      const btns = Array.from(
        document.querySelectorAll<HTMLButtonElement>("#abandon-confirm button"),
      );
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      const next = e.shiftKey ? (i <= 0 ? btns.length - 1 : i - 1) : (i + 1) % btns.length;
      btns[next]?.focus();
    }
  };
  const keep = button("続ける", close, { primary: true, label: "続ける（放棄しない）" });
  const go = button(
    "放棄する",
    () => {
      close();
      onAbandon();
    },
    { label: "放棄する（ランを終了）" },
  );
  go.classList.add("hud-btn--danger");
  const overlay = el(
    "div",
    { id: "abandon-confirm", class: "hud-modal" },
    el(
      "div",
      {
        class: "hud-modal-box",
        role: "alertdialog",
        "aria-modal": "true",
        "aria-labelledby": "abandon-title",
        "aria-describedby": "abandon-desc",
      },
      el("h2", { id: "abandon-title" }, "ランを放棄しますか？"),
      el("p", { id: "abandon-desc" }, "放棄すると今回のランは終了します。"),
      el("div", { class: "hud-row" }, go, keep),
    ),
  );
  document.getElementById("hud")?.append(overlay);
  document.addEventListener("keydown", onKey, true);
  keep.focus();
}
