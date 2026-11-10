import { expect, test } from "@playwright/test";

async function startAndEnterBattle(page: import("@playwright/test").Page) {
  await page.goto("/?fx=0&seed=e2e-7");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
}

for (const where of ["map", "battle"] as const) {
  test(`${where}: ランを放棄は確認が出て、続ける(初期フォーカス)/Escで戻る`, async ({ page }) => {
    await startAndEnterBattle(page);
    if (where === "battle") {
      await page.getByRole("button", { name: /r1へ移動/ }).click();
      await expect(page.locator("body")).toHaveAttribute("data-scene", where);
    }
    const open = page.getByRole("button", { name: /ランを放棄/ });
    // 高さ 40px 以上
    expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await open.click();
    const dlg = page.getByRole("alertdialog");
    await expect(dlg).toContainText("放棄すると今回のランはここで終わります。");
    await expect(page.getByRole("button", { name: /^続ける/ })).toBeFocused();
    expect(
      (await page.getByRole("button", { name: /放棄する/ }).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(40);
    // 続ける → 元の画面
    await page.getByRole("button", { name: /^続ける/ }).click();
    await expect(dlg).toBeHidden();
    await expect(page.locator("body")).toHaveAttribute("data-scene", where);
    // Esc でも戻る
    await open.click();
    await expect(dlg).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
    await expect(page.locator("body")).toHaveAttribute("data-scene", where);
    // 放棄する → リザルト
    await open.click();
    await page.getByRole("button", { name: /放棄する/ }).click();
    await expect(page.locator("body")).toHaveAttribute("data-scene", "result");
  });
}
