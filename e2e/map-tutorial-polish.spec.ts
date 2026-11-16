import { expect, test, type Page } from "@playwright/test";

/** Issue #64 PR-2: 375px 幅で案内が出てスキップでき、キーボードだけでも届く。
 * `?seed=` は案内を出さない QA フックなので、シードはタイトルの入力欄に書く。 */
async function startWithSeed(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.locator("#seed-input").fill("e2e-7");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
}

test("375px 幅で案内が出て、HUD ボタンと重ならず、スキップできる", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await startWithSeed(page, "/?fx=0&qa=1");
  const bubble = page.locator(".map-tutorial");
  await expect(bubble).toContainText("ステップ 1/4");
  // fx=0 では脈動クラスが付かない（太枠のみ）
  await expect(page.locator(".hud-btn--pulse")).toHaveCount(0);
  await expect(page.locator(".hud-btn--tutorial").first()).toBeVisible();
  const b = await bubble.boundingBox();
  expect(b).not.toBeNull();
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width).toBeLessThanOrEqual(375);
  const buttons = await page.locator("#hud button:not(.map-tutorial button)").all();
  for (const btn of buttons) {
    const r = await btn.boundingBox();
    if (!r) continue;
    expect(r.y + r.height <= b!.y || r.y >= b!.y + b!.height).toBe(true);
  }
  await bubble.getByRole("button", { name: "スキップ" }).click({ timeout: 3000 });
  await expect(bubble).toHaveCount(0);
});

test("キーボードの Shift+Tab 1回でスキップに届き、Enter で閉じられる", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await startWithSeed(page, "/?fx=0&qa=1");
  const skip = page.locator(".map-tutorial").getByRole("button", { name: "スキップ" });
  // 初期フォーカスは操作ボタン。Shift+Tab 1回でスキップに届く（吹き出しは DOM の先頭）
  await page.keyboard.press("Shift+Tab");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".map-tutorial")).toHaveCount(0);
});
