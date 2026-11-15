import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * #169: ボス戦を始めた直後（スクロールなし）に、操作列の全段（スキル/パッチ/ログ）と「ターン終了」が
 * 画面内かつスクロール領域の内側に収まる。390×844（スマホ縦）が主要環境。
 * 台本 full-run-plan.json（seed e2e-full-1）で3階ボス部屋の戦闘開始直後まで進める（boss-intro-heading.spec.ts と同じ進め方）。
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
  { width: 1280, height: 720 },
] as const;

for (const vp of VIEWPORTS) {
  test(`ボス戦の操作列(#169): ${vp.width}x${vp.height} で全段がスクロールなしで見える`, async ({
    page,
  }) => {
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
    await expect(page.locator(".hud-log")).toHaveText(/ここが、すべての障害の出どころだ。/);
    if (process.env.SHOTS)
      await page.screenshot({ path: `${process.env.SHOTS}/${vp.width}x${vp.height}.png` });

    // 操作列の中身（ボタン・ログ行）と「ターン終了」。それぞれが画面内で、スクロール領域に切られていない
    const result = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          ".hud-battle-actions button, .hud-battle-actions .hud-log, .hud-battle-foot .hud-btn--primary",
        ),
      ];
      const rows = new Set<number>();
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
        if (node.tagName === "BUTTON") rows.add(Math.round(r.top / 4));
      }
      return { problems, count: targets.length, rows: rows.size };
    });
    expect(result.count, "検査対象が見つかる").toBeGreaterThanOrEqual(4);
    expect(result.problems, "隠れている要素").toEqual([]);
    console.log(`${vp.width}x${vp.height}: 対象${result.count}個・ボタンの段数${result.rows}`);
  });
}
