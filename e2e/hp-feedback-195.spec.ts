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

/** #195 QA NG: 前のランの稼働率を持ち越して、新ラン直後の満タン表示が太字になっていた。 */
for (const via of ["retry", "title"] as const) {
  test(`新ラン直後の稼働率は太字にならない (${via})`, async ({ page }) => {
    await page.goto("/?fx=0&qa=1&seed=e2e-7");
    await page.getByRole("button", { name: "新しいラン" }).click();
    await page.getByRole("button", { name: /r1へ移動/ }).click();
    await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");
    const stat = page.locator(".hud-stat", { hasText: "稼働率" }).locator("strong").first();
    const full = await stat.textContent();
    // 被弾して前のランの稼働率を満タン以外にしておく
    for (let i = 0; i < 40 && (await stat.textContent()) === full; i++) {
      await page.evaluate(() => window.__qa!.waitForIdle());
      await page.getByRole("button", { name: "ターン終了" }).first().click();
      await page.evaluate(() => window.__qa!.waitForIdle());
    }
    expect(await stat.textContent()).not.toBe(full);
    await page.getByRole("button", { name: /ランを放棄/ }).click();
    await page.getByRole("button", { name: /放棄する/ }).click();
    await expect(page.locator("body")).toHaveAttribute("data-scene", "result");
    if (via === "retry") {
      await page.getByRole("button", { name: "同じシードでもう一度" }).click();
    } else {
      await page.getByRole("button", { name: "タイトルへ" }).click();
      await page.getByRole("button", { name: "新しいラン" }).click();
    }
    await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
    await expect(stat).toHaveText(full!);
    await expect(stat).not.toHaveClass(/hud-stat-changed/);
    expect(Number(await stat.evaluate((e) => getComputedStyle(e).fontWeight))).toBeLessThan(700);
  });
}
