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
import { isFading } from "./flags";

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

const IDLE_POLL_MS = 25;
const IDLE_TIMEOUT_MS = 5000;

function isIdle(): boolean {
  const hud = document.getElementById("hud");
  return !hud?.hasAttribute("inert") && !isFading();
}

/**
 * アニメーション再生中（hudBusy=inert）またはフェードイン中なら、
 * 完了するまで待機する Promise を返す。既に idle なら即 resolve。
 * 待ちごとに独立したポーリングとタイマーを持ち、完了・タイムアウトのどちらでも必ず片付ける
 * （他の待ちを巻き込まない）。タイムアウトは5秒。
 */
export function waitForIdle(): Promise<void> {
  if (isIdle()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(done, IDLE_TIMEOUT_MS);
    const poll = setInterval(() => {
      if (isIdle()) done();
    }, IDLE_POLL_MS);
    function done(): void {
      clearTimeout(timeout);
      clearInterval(poll);
      resolve();
    }
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

  const devMode = import.meta.env.DEV;
  const qaParam =
    typeof location !== "undefined" ? new URLSearchParams(location.search).get("qa") : null;
  const enabled = devMode || qaParam === "1";

  if (!enabled) return;

  (window as unknown as Record<string, unknown>).__qa = {
    stateHash: getStateHash,
    waitForIdle,
    scene: getScene,
  };
}
