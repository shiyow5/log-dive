/**
 * DOM の HUD（ボタン・数値・ログ）。canvas にはマップ・バグ・pixelfx だけを描き、
 * 操作できるものはすべてここに <button> などで置く（キーボード・読み上げ・getByRole のため）。
 */
import "./hud.css";

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

/** 演出の再生中は入力を受けない（spec-a v0.2 §11）。 */
export function setHudBusy(busy: boolean): void {
  hudBusy = busy;
  const r = root();
  r.toggleAttribute("inert", busy);
  r.setAttribute("aria-busy", busy ? "true" : "false");
}

/** 最初のボタン（または指定要素）にフォーカスを移す。画面が変わったときにキーボードで迷子にしない。 */
export function focusFirst(container: HTMLElement): void {
  const target = container.querySelector<HTMLElement>("[data-autofocus], button:not([disabled])");
  target?.focus();
}
