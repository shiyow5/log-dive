import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * #198: ボスではない通常戦闘で候補が5件のとき、操作列の1行目（スキル）が上側で切れていた（390×844）。
 * 台本 full-run-plan.json（seed e2e-full-1）で、候補5件の通常戦闘（3階）の開始直後まで進め、
 * 操作列の全段（スキル/パッチ/ログ）と「ターン終了」が画面内かつスクロール領域の内側に収まることを確かめる。
 * あわせて1行目のスキルボタンが実際に押せる（中心の要素がそのボタン自身）ことも確かめる。
 */
type Press =
  | { readonly kind: "move"; readonly name: string }
  | { readonly kind: "button"; readonly names: readonly string[] };
interface Plan {
  readonly seed: string;
  readonly steps: ReadonlyArray<{ readonly press: Press; readonly scene: string }>;
}
const plan = JSON.parse(
  readFileSync(new URL("./fixtures/full-run-plan.json", import.meta.url), "utf8"),
) as Plan;

const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function press(page: Page, p: Press): Promise<void> {
  if (p.kind === "move") {
    await page
      .getByRole("navigation", { name: "隣の部屋" })
      .getByRole("button", { name: new RegExp(`^${esc(p.name)}`) })
      .click();
    return;
  }
  for (const name of p.names) await page.getByRole("button", { name, exact: true }).click();
}

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const;

for (const vp of VIEWPORTS) {
  test(`候補5件の通常戦闘(#198): ${vp.width}x${vp.height} で操作列の全段が切れずに押せる`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(vp);
    await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
    await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
    await page.getByRole("button", { name: "新しいラン" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
    let found = false;
    for (const step of plan.steps) {
      await press(page, step.press);
      await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
      await page.evaluate(() => window.__qa!.waitForIdle());
      if (step.scene !== "battle") continue;
      const boss = await page.locator(".hud-panel--boss").count();
      const cands = await page.locator(".hud-cands li").count();
      if (!boss && cands >= 5) {
        found = true;
        break;
      }
    }
    expect(found, "候補5件の通常戦闘まで進める").toBe(true);
    if (process.env.SHOTS)
      await page.screenshot({ path: `${process.env.SHOTS}/198-${vp.width}x${vp.height}.png` });

    const result = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          ".hud-battle-actions button, .hud-battle-actions .hud-log, .hud-battle-foot .hud-btn--primary",
        ),
      ];
      const problems: string[] = [];
      for (const node of targets) {
        const r = node.getBoundingClientRect();
        const name = (node.textContent ?? "").trim().slice(0, 16);
        if (r.height === 0) problems.push(`${name}: 高さ0`);
        if (r.top < -0.5 || r.bottom > window.innerHeight + 0.5)
          problems.push(`${name}: viewport ${r.top}-${r.bottom}/${window.innerHeight}`);
        for (let e = node.parentElement; e; e = e.parentElement) {
          if (!/auto|scroll|hidden/.test(getComputedStyle(e).overflowY)) continue;
          if (getComputedStyle(e).display === "contents") continue;
          const c = e.getBoundingClientRect();
          if (r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5)
            problems.push(
              `${name}: ${e.className || e.id} ${r.top}-${r.bottom} / ${c.top}-${c.bottom}`,
            );
        }
        // 押せる: ボタンの中心にある要素がそのボタン（の子孫）
        if (node.tagName === "BUTTON") {
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!hit || !node.contains(hit)) problems.push(`${name}: 中心が別要素に覆われている`);
        }
      }
      return { problems, count: targets.length };
    });
    expect(result.count, "検査対象が見つかる").toBeGreaterThanOrEqual(4);
    expect(result.problems, "切れている・覆われている要素").toEqual([]);

    // 1行目の先頭スキルを実際に押せる（クリックが他要素に遮られない）
    const first = page.locator(".hud-skills .hud-btn:not(:disabled)").first();
    await first.click({ trial: true });
  });
}
