import { expect, test } from "@playwright/test";

/** Issue #195: 稼働率の数値は、前回の描画から変わったときだけ太字（?fx=0 でも効く）。 */
for (const fx of ["0", "1"]) {
  test(`稼働率は変化した描画だけ太字 (fx=${fx})`, async ({ page }) => {
    await page.goto(`/?fx=${fx}&qa=1&seed=e2e-7`);
    await page.getByRole("button", { name: "新しいラン" }).click();
    await page.getByRole("button", { name: /r1へ移動/ }).click();
    await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");
    const stat = page.locator(".hud-stat", { hasText: "稼働率" }).locator("strong").first();
    let prev = await stat.textContent();
    let sawChange = false;
    for (let i = 0; i < 40 && !sawChange; i++) {
      await page.evaluate(() => window.__qa!.waitForIdle());
      await page.getByRole("button", { name: "ターン終了" }).first().click();
      await page.evaluate(() => window.__qa!.waitForIdle());
      if ((await page.locator("body").getAttribute("data-scene")) !== "battle") break;
      const now = await stat.textContent();
      const bold = await stat.evaluate((e) => getComputedStyle(e).fontWeight);
      if (now !== prev) {
        sawChange = true;
        await expect(stat).toHaveClass(/hud-stat-changed/);
        expect(Number(bold)).toBeGreaterThanOrEqual(700);
      } else {
        await expect(stat).not.toHaveClass(/hud-stat-changed/);
        expect(Number(bold)).toBeLessThan(700);
      }
      prev = now;
    }
    expect(sawChange).toBe(true);
  });
}
