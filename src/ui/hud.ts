/**
 * DOM の HUD（ボタン・数値・ログ）。canvas にはマップ・バグ・pixelfx だけを描き、
 * 操作できるものはすべてここに <button> などで置く（キーボード・読み上げ・getByRole のため）。
 */
import "./hud.css";
import { playSfx } from "../audio/player";

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c);
  }
  return e;
}

export function button(
  text: string,
  onClick: () => void,
  opts: { label?: string; disabled?: boolean; primary?: boolean } = {},
): HTMLButtonElement {
  const b = el("button", {
    type: "button",
    "aria-label": opts.label,
    class: opts.primary ? "hud-btn hud-btn--primary" : "hud-btn",
    disabled: opts.disabled,
  });
  b.textContent = text;
  b.addEventListener("click", () => {
    if (hudBusy) return;
    playSfx("click");
    onClick();
  });
  return b;
}

let hudBusy = false;

function root(): HTMLElement {
  let r = document.getElementById("hud");
  if (!r) {
    r = el("div", { id: "hud" });
    document.getElementById("game")?.append(r);
  }
  return r;
}

function focusKey(e: Element | null): string | null {
  if (!(e instanceof HTMLButtonElement)) return null;
  return e.getAttribute("aria-label") ?? e.textContent;
}

/**
 * 画面ごとに HUD を作り直す。scene は data-scene に入れる（e2e が待つ）。
 * 同じ画面での描き直しなら、押したボタンにフォーカスを戻す（キーボードで連打できるように）。
 * data-autofocus があればそこを優先、戻せなければ最初のボタンへ。
 */
export function renderHud(scene: string, ...children: Child[]): HTMLElement {
  const r = root();
  const sameScene = r.dataset.scene === scene;
  const prevKey = sameScene ? focusKey(document.activeElement) : null;
  r.replaceChildren();
  r.dataset.scene = scene;
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    r.append(c);
  }
  document.body.dataset.scene = scene;
  const auto = r.querySelector<HTMLElement>("[data-autofocus]");
  const again = auto
    ? auto
    : prevKey
      ? Array.from(r.querySelectorAll("button")).find((b) => focusKey(b) === prevKey && !b.disabled)
      : undefined;
  if (again) again.focus();
  else focusFirst(r);
  return r;
}

export function clearHud(): void {
  const r = root();
  r.replaceChildren();
  delete r.dataset.scene;
}

/**
 * 演出の再生中は入力を受けない（spec-a v0.2 §11）。
 * inert の間は focus() が効かないので、解除したときに HUD の外にいるフォーカスを
 * data-autofocus（なければ最初のボタン）へ戻す。キーボードだけでも続けて操作できるように。
 */
export function setHudBusy(busy: boolean): void {
  hudBusy = busy;
  const r = root();
  r.toggleAttribute("inert", busy);
  r.setAttribute("aria-busy", busy ? "true" : "false");
  if (!busy && !r.contains(document.activeElement)) focusFirst(r);
}

/** 最初のボタン（または指定要素）にフォーカスを移す。画面が変わったときにキーボードで迷子にしない。 */
export function focusFirst(container: HTMLElement): void {
  // 危険操作（.hud-abandon）は初期フォーカスにしない（Enter 連打で放棄ダイアログが開かないように）
  const target = container.querySelector<HTMLElement>(
    "[data-autofocus], button:not([disabled]):not(.hud-abandon):not(.hud-guide)",
  );
  // 初期フォーカスで中段が勝手にスクロールしないよう preventScroll（#87: scrollTop=0 を保つ）
  target?.focus({ preventScroll: true });
}

// #117: 操作列（.hud-battle-actions）が溢れているときにスクロールインジケーターを表示・制御
const scrollHintEl = el("div", { class: "scroll-hint", "aria-hidden": "true" },
  el("span", { class: "scroll-arrow" }, "▼"),
);
let scrollObserver: IntersectionObserver | null = null;
let scrollThrottleTimer: number | null = null;

/** 操作列のスクロール状態を監視し、is-scrollable / is-at-bottom を切替える。 */
export function initScrollIndicator(): void {
  const actions = document.querySelector<HTMLElement>(".hud-battle-actions");
  if (!actions) return;

  // 既にインジケーターがあればスキップ
  if (actions.querySelector(".scroll-hint")) return;
  actions.style.position = "relative";
  actions.append(scrollHintEl);

  // bottom 付近を監視: 下端が見えれば is-at-bottom（もっと下がない）
  const sentinel = el("div", { style: "position:absolute;bottom:0;left:0;right:0;height:1px;pointer-events:none;" });
  actions.append(sentinel);

  scrollObserver?.disconnect();
  scrollObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target === sentinel) {
        scrollHintEl.classList.toggle("is-at-bottom", e.isIntersecting);
      }
    }
  }, { root: actions, threshold: 1 });
  scrollObserver.observe(sentinel);

  // スクロールイベント（throttle）: 溢れているか判定
  actions.removeEventListener("scroll", onScroll);
  actions.addEventListener("scroll", onScroll, { passive: true });
}

function onScroll(): void {
  if (scrollThrottleTimer !== null) return;
  scrollThrottleTimer = window.setTimeout(() => {
    scrollThrottleTimer = null;
  }, 50);
  const actions = document.querySelector<HTMLElement>(".hud-battle-actions");
  if (!actions) return;
  const { scrollTop, scrollHeight, clientHeight } = actions;
  const isScrollable = scrollHeight > clientHeight + 1;
  actions.classList.toggle("is-scrollable", isScrollable);
  // 下端にいれば is-at-bottom（IntersectionObserver との整合用）
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
  scrollHintEl.classList.toggle("is-at-bottom", atBottom);
}

// #117: 横持ちスマホ（#166）では症状欄（.hud-cols）が overflow-y:auto になるので監視
const symptomScrollEl = el("div", { class: "scroll-hint", "aria-hidden": "true" },
  el("span", { class: "scroll-arrow" }, "▼"),
);
let symptomScrollObserver: IntersectionObserver | null = null;
let symptomScrollThrottleTimer: number | null = null;

export function initSymptomScrollIndicator(): void {
  // 横持ちレイアウトでのみ有効（.hud-cols がスクロール対象）
  const cols = document.querySelector<HTMLElement>(".hud-battle-body .hud-cols");
  if (!cols) return;
  if (cols.querySelector(".scroll-hint")) return;
  // hud-cols がスクロールしているか確認（CSSでoverflow-y:autoになっているか）
  const overflowY = getComputedStyle(cols).overflowY;
  if (overflowY !== "auto" && overflowY !== "scroll") return;
  cols.style.position = "relative";
  cols.append(symptomScrollEl);

  const sentinel = el("div", { style: "position:absolute;bottom:0;left:0;right:0;height:1px;pointer-events:none;" });
  cols.append(sentinel);

  symptomScrollObserver?.disconnect();
  symptomScrollObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target === sentinel) {
        symptomScrollEl.classList.toggle("is-at-bottom", e.isIntersecting);
      }
    }
  }, { root: cols, threshold: 1 });
  symptomScrollObserver.observe(sentinel);

  cols.removeEventListener("scroll", onSymptomScroll);
  cols.addEventListener("scroll", onSymptomScroll, { passive: true });
}

function onSymptomScroll(): void {
  if (symptomScrollThrottleTimer !== null) return;
  symptomScrollThrottleTimer = window.setTimeout(() => {
    symptomScrollThrottleTimer = null;
  }, 50);
  const cols = document.querySelector<HTMLElement>(".hud-battle-body .hud-cols");
  if (!cols) return;
  const { scrollTop, scrollHeight, clientHeight } = cols;
  const isScrollable = scrollHeight > clientHeight + 1;
  cols.classList.toggle("is-scrollable", isScrollable);
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
  symptomScrollEl.classList.toggle("is-at-bottom", atBottom);
}
