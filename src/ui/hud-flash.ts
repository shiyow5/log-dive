/**
 * 推理で「絞れた」瞬間に、ログ行の背景を 800ms だけ #4ECDC4 20% にする（Issue #104）。
 * 文字色は変えない。動きではなく背景色だけなので、視差効果を減らす設定でもそのまま出す（静的）。
 */
export function flashLogLine(): void {
  const log = document.querySelector<HTMLElement>("#hud .hud-log");
  if (!log) return;
  log.classList.remove("hud-log-flash");
  void log.offsetWidth;
  log.classList.add("hud-log-flash");
}
