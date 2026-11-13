import { expect, test } from "@playwright/test";

test("landscape 844x390: リザルト見出しが切れない #126", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/?fx=0&qa=1&seed=e2e-7");
  await expect(page.getByRole("button", { name: "新しいラン" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");

  // r1 へ移動
  const moveBtn = page.getByRole("button", { name: /r1へ移動/ });
  await moveBtn.click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");

  // ターン終了を繰り返して敗北まで
  for (let i = 0; i < 60; i++) {
    if ((await page.locator("body").getAttribute("data-scene")) === "result") break;
    await page.evaluate(() => window.__qa!.waitForIdle());
    await page.getByRole("button", { name: "ターン終了" }).first().click({ timeout: 2000 }).catch(() => undefined);
  }
  await expect(page.locator("body")).toHaveAttribute("data-scene", "result");

  // リザルトのスクショ
  await page.screenshot({ path: "e2e/screenshots/landscape-126-result.png" });

  // h1 が完全に画面内にあるか確認
  const h1El = page.locator('#hud[data-scene="result"] h1');
  const h1Box = await h1El.boundingBox();
  const vp = page.viewportSize();
  expect(h1Box).not.toBeNull();
  expect(h1Box!.y).toBeGreaterThanOrEqual(0);
  expect(h1Box!.y + h1Box!.height).toBeLessThanOrEqual(vp!.height);
});

test("landscape 844x390: マップ下端でランを放棄が欠けない #126", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/?fx=0&qa=1&seed=e2e-7");
  await expect(page.getByRole("button", { name: "新しいラン" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");

  await page.waitForTimeout(1500);

  // ランを放棄ボタンの確認
  const abandonBtn = page.getByRole("button", { name: /ランを放棄/ });
  const isVisible = await abandonBtn.isVisible({ timeout: 3000 }).catch(() => false);
  expect(isVisible).toBeTruthy();

  if (isVisible) {
    const box = await abandonBtn.boundingBox();
    const vp = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp!.height);
  }

  await page.screenshot({ path: "e2e/screenshots/landscape-126-map.png" });
});
