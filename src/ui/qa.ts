/**
 * Issue #9: テスト用フック `window.__qa`
 * - stateHash(): 現在の RunState の stateHash を返す（null の場合は null）
 * - waitForIdle(): アニメーション・画面遷移・入力が終わったら resolve する Promise
 * - scene(): 今の body[data-scene] の値
 *
 * 本番ビルドでは import.meta.env.DEV のときだけ初期化。
 * ?qa=1 が付いている場合も有効化（プレビュー・本番 Pages からの e2e 対応）。
 */
import { stateHash as hashFn } from "../core/hash";
import { current, hasRun } from "../scenes/run-port";

export interface QaHooks {
  stateHash(): string | null;
  waitForIdle(): Promise<void>;
  scene(): string | null;
}

declare global {
  interface Window {
    __qa?: QaHooks;
  }
}

let idleResolve: (() => void) | null = null;
let idleResolvers: Array<() => void> = [];

/**
 * アニメーション再生中（hudBusy=inert）またはフェード中なら、
 * 完了するまで待機する Promise を返す。
 * 既に idle なら即 resolve。
 */
export function waitForIdle(): Promise<void> {
  const hud = document.getElementById("hud");
  if (!hud?.hasAttribute("inert")) {
    return Promise.resolve();
  }

  // 既に待っている場合はその Promise を返す
  if (idleResolvers.length > 0) {
    return new Promise<void>((resolve) => idleResolvers.push(resolve));
  }

  return new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      const hud = document.getElementById("hud");
      if (!hud?.hasAttribute("inert")) {
        observer.disconnect();
        const ws = idleResolvers;
        idleResolvers = [];
        for (const w of ws) w();
        resolve();
      }
    });
    if (hud) {
      observer.observe(hud, { attributes: true, attributeFilter: ["inert"] });
    }

    // 即解決の場合
    if (!hud?.hasAttribute("inert")) {
      observer.disconnect();
      resolve();
      return;
    }

    // タイムアウト防止（5秒）
    setTimeout(() => {
      observer.disconnect();
      const ws = idleResolvers;
      idleResolvers = [];
      for (const w of ws) w();
      resolve();
    }, 5000);

    idleResolvers.push(resolve);
  });
}

/** 現在の RunState の stateHash を返す（ラン未開始なら null） */
export function getStateHash(): string | null {
  if (!hasRun()) return null;
  return hashFn(current());
}

/** body[data-scene] を返す */
export function getScene(): string | null {
  return document.body.dataset.scene ?? null;
}

/** `window.__qa` を初期化（DEV 環境または ?qa=1 のとき） */
export function installQa(): void {
  if (typeof window === "undefined") return;

  const devMode =
    typeof import.meta !== "undefined" &&
    (import.meta as Record<string, unknown>).env?.DEV === true;
  const qaParam =
    typeof location !== "undefined"
      ? new URLSearchParams(location.search).get("qa")
      : null;
  const enabled = devMode || qaParam === "1";

  if (!enabled) return;

  (window as Record<string, unknown>).__qa = {
    stateHash: getStateHash,
    waitForIdle,
    scene: getScene,
  };
}
