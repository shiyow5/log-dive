import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * #158: ボス戦の導入文2行が、4解像度すべてで戦闘HUDのログ行に全文見える（切れない）。
 * 台本 full-run-plan.json（seed e2e-full-1）を再生し、3階ボス部屋の戦闘が始まった直後に確認する。
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
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1920, height: 1080 },
] as const;

for (const vp of VIEWPORTS) {
  test(`ボス戦導入文(#158): ${vp.width}x${vp.height} で2行とも表示範囲内`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(vp);
    await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
    await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
    await page.getByRole("button", { name: "新しいラン" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
    for (const step of plan.steps) {
      await press(page, step.press);
      await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
      await page.evaluate(() => window.__qa!.waitForIdle());
      const title =
        step.scene === "battle" ? await page.locator(".hud-battle-title h2").textContent() : "";
      if (title?.includes("根本原因 #BUG-000")) break;
    }
    const log = page.locator(".hud-log");
    await expect(log).toHaveText(
      /ここが、すべての障害の出どころだ。\s*ログが多すぎる。どのバグにも見える。/,
    );
    if (process.env.SHOTS)
      await page.screenshot({ path: `${process.env.SHOTS}/${vp.width}x${vp.height}.png` });
    // ログ行の箱が、自分を切り取る全ての祖先（スクロール領域）と画面の内側に収まっている
    const clipped = await log.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const problems: string[] = [];
      if (r.top < 0 || r.bottom > window.innerHeight)
        problems.push(`viewport ${r.top}-${r.bottom}/${window.innerHeight}`);
      for (let e = node.parentElement; e; e = e.parentElement) {
        if (!/auto|scroll|hidden/.test(getComputedStyle(e).overflowY)) continue;
        if (getComputedStyle(e).display === "contents") continue; // 箱を持たない（横持ちの中段）
        const c = e.getBoundingClientRect();
        if (r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5)
          problems.push(`${e.className || e.id} ${r.top}-${r.bottom} / ${c.top}-${c.bottom}`);
      }
      return problems;
    });
    expect(clipped, "導入文2行（ログ行）が切れていない").toEqual([]);
  });
}
