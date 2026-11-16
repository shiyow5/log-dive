import { expect, test, type Page } from "@playwright/test";

/** Issue #64 / PR #205 のレビュー指摘: スキップがタップできる・リトライでもステップ1から。
 * `?seed=` は QA フック（案内を出さない）なので、シードはタイトルの入力欄に書く。 */
async function startWithSeed(page: Page, seed: string): Promise<void> {
  await page.goto("/?fx=0&qa=1");
  await page.locator("#seed-input").fill(seed);
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
}

test("スキップボタンを実際にクリックでき、押すと案内が消える", async ({ page }) => {
  await startWithSeed(page, "e2e-7");
  const bubble = page.locator(".map-tutorial");
  await expect(bubble).toContainText("ステップ 1/4");
  // force なし: 他の要素（pointer-events: none の #hud）に遮られていればここで失敗する
  await bubble.getByRole("button", { name: "スキップ" }).click({ timeout: 3000 });
  await expect(bubble).toHaveCount(0);
});

test("途中で負けて「同じシードでもう一度」しても、案内はステップ1から始まる", async ({ page }) => {
  await startWithSeed(page, "e2e-7");
  await page.getByRole("button", { name: /r1へ移動/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");
  for (let i = 0; i < 60; i++) {
    if ((await page.locator("body").getAttribute("data-scene")) === "result") break;
    await page.evaluate(() => window.__qa!.waitForIdle());
    await page
      .getByRole("button", { name: "ターン終了" })
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
  }
  await expect(page.locator("body")).toHaveAttribute("data-scene", "result");
  await page.getByRole("button", { name: "同じシードでもう一度" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await expect(page.locator(".map-tutorial")).toContainText("ステップ 1/4");
});
