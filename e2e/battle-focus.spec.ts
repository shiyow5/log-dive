import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * #158 Codex P2: 844×390（横持ち）でスキルを使って CPU が減り、操作ボタンの下に「使えない理由」が増えても、
 * ログ行を送る scrollIntoView が、フォーカス中のスキルボタンを .hud-battle-actions の表示範囲から外さない。
 */
type Press =
  | { readonly kind: "move"; readonly name: string }
  | { readonly kind: "button"; readonly names: readonly string[] };
interface Plan {
  readonly seed: string;
  readonly steps: ReadonlyArray<{
    readonly press: Press;
    readonly scene: string;
    readonly floor: number;
  }>;
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

test("戦闘HUD(#158 P2): 844×390 でCPUが減ったあとも、フォーカス中のボタンが操作列の表示範囲内", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  const first = plan.steps.findIndex((s) => s.floor === 2 && s.scene === "battle");
  for (const step of plan.steps.slice(0, first + 1)) {
    await press(page, step.press);
    await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
    await page.evaluate(() => window.__qa!.waitForIdle());
  }
  const actions = page.locator(".hud-battle-actions");
  // 有効なスキルを順に使う（CPU が減り、無効理由が増える）。毎回、フォーカス中のボタンが見えていること
  for (let i = 0; i < 4; i++) {
    const btn = page.locator(".hud-skills button:not([disabled])").first();
    if ((await btn.count()) === 0) break;
    await btn.click();
    await page.evaluate(() => window.__qa!.waitForIdle());
    const r = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      const box = document.querySelector(".hud-battle-actions");
      if (!a || !box || !box.contains(a)) return { inside: false } as const;
      const b = a.getBoundingClientRect();
      // 操作列そのものと、それを切り取る祖先すべての内側に入っているか
      const problems: string[] = [];
      if (b.top < 0 || b.bottom > window.innerHeight) problems.push("viewport");
      for (let e: Element | null = box; e; e = e.parentElement) {
        if (!/auto|scroll|hidden/.test(getComputedStyle(e).overflowY)) continue;
        if (getComputedStyle(e).display === "contents") continue;
        const c = e.getBoundingClientRect();
        if (b.top < c.top - 0.5 || b.bottom > c.bottom + 0.5) problems.push(String(e.className));
      }
      return { inside: true, problems } as const;
    });
    if (!r.inside) break; // フォーカスが操作列の外（シーン遷移など）なら対象外
    expect(r.problems, `${i + 1}回目のスキル後`).toEqual([]);
  }
  await expect(actions).toBeVisible();
});
