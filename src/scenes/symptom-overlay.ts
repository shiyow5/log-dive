import { loadGameData } from "../core/data";
import { button, el } from "../ui/hud";
import { symptomGuide } from "./symptom-guide";

const OVERLAY_ID = "symptom-overlay";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

/** Tab / Shift+Tab のフォーカスをダイアログ内の要素だけで循環させる（Codex P2 / #118）。 */
function trapTab(e: KeyboardEvent, dialog: HTMLElement | null): void {
  if (!dialog) return;
  const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (items.length === 0) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && dialog.contains(active);
  if (e.shiftKey && (!inside || active === first)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || active === last)) {
    e.preventDefault();
    first.focus();
  }
}

/** 戦闘中に「症状の読み方」だけを開く小さなパネル（#118）。遊び方と同じ symptomGuide を使う。 */
export function openSymptomOverlay(opener?: HTMLElement): void {
  if (document.getElementById(OVERLAY_ID)) return;
  const guide = symptomGuide(loadGameData());
  const close = () => {
    document.getElementById(OVERLAY_ID)?.remove();
    document.removeEventListener("keydown", onKey);
    opener?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
    // ダイアログが開いている間は Tab で背後の戦闘ボタンへ抜けないよう、ダイアログ内で循環させる
    if (e.key === "Tab") trapTab(e, document.getElementById(OVERLAY_ID));
  };
  const overlay = el(
    "div",
    {
      id: OVERLAY_ID,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "症状の読み方",
      style:
        "position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:100;pointer-events:auto;",
    },
    el(
      "div",
      { class: "hud-panel help-panel" },
      el(
        "div",
        { class: "help-body" },
        el("h2", {}, "症状の読み方"),
        el("p", {}, "症状は種類ごとに決まっている。ただし同じ症状が複数の種類に出ることもある。"),
        el(
          "ul",
          { class: "help-symptoms" },
          ...guide.rows.map((r) => el("li", {}, `${r.name}: ${r.symptoms.join(" / ")}`)),
        ),
        ...guide.shared.map((x) =>
          el(
            "p",
            { class: "hud-hint" },
            `「${x.symptom}」は${x.bugNames.join("と")}の${x.bugNames.length}種だけ。`,
          ),
        ),
      ),
      el("div", { class: "help-footer" }, button("閉じる", close, { primary: true })),
    ),
  );
  document.getElementById("hud")?.append(overlay);
  document.addEventListener("keydown", onKey);
  overlay.querySelector<HTMLElement>("button")?.focus();
}
