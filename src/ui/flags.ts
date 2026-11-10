/**
 * URL で切り替えるフラグ。
 * - `?fx=0` … 演出（pixelfx・画面遷移のフェード）を切る。Playwright smoke 用
 * - `?seed=xxx` … タイトルのシード欄の初期値
 */
export interface Flags {
  fx: boolean;
  seed: string | null;
}

export function parseFlags(search: string): Flags {
  const p = new URLSearchParams(search);
  return { fx: p.get("fx") !== "0", seed: p.get("seed") };
}

let cached: Flags | null = null;

export function flags(): Flags {
  if (!cached) cached = parseFlags(typeof location === "undefined" ? "" : location.search);
  return cached;
}

/** 演出を出してよいか。?fx=0 か OS の「視差効果を減らす」で切る。 */
export function fxEnabled(): boolean {
  if (!flags().fx) return false;
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  return true;
}

let fadeEndsAt = 0;

/** フェードイン開始を記録する（QA の waitForIdle が完了を待てるようにする）。 */
export function markFade(durationMs: number): void {
  fadeEndsAt = Math.max(fadeEndsAt, performance.now() + durationMs);
}

/** フェード中か。 */
export function isFading(): boolean {
  return performance.now() < fadeEndsAt;
}

/**
 * 画面を開いている途中で OS の「視差効果を減らす」が有効になったら cb を呼ぶ。戻り値で解除。
 * matchMedia が無い環境（Node のテストなど）では何もしない。
 */
export function onReducedMotion(cb: () => void): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  const handler = (e: MediaQueryListEvent) => {
    if (e.matches) cb();
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
