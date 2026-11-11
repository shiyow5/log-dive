import { expect, test } from "@playwright/test";

test("タイトル画面で「遊び方」ボタンを押すとパネルが開き、閉じる/Escで閉じる", async ({ page }) => {
  await page.goto("/?fx=0");
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });

  // force なしで押せること（#hud は pointer-events:none。overlay 側で auto にしている）
  await page.getByRole("button", { name: "遊び方" }).click();
  const overlay = page.locator("#help-overlay");
  await expect(overlay).toBeVisible();
  // 遊び方ボタンは submit しない（ランが始まらない）
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title");

  await expect(overlay.locator("h2")).toContainText("遊び方");
  await expect(overlay).toContainText("根本原因");
  // CPU とダメージは skills.json の値（3/20 はダメージで、CPU ではない）
  await expect(overlay).toContainText("ホットフィックスは応急処置（CPU 1・ダメージ 3）");
  await expect(overlay).toContainText("修正パッチは完全修正（CPU 2・ダメージ 20");
  await expect(overlay).toContainText("毎ターン 3");
  await expect(overlay).toContainText("ブレークポイント・二分探索が増える");
  await expect(overlay.getByRole("list", { name: "マップ記号" }).getByRole("listitem")).toHaveCount(
    7,
  );

  await overlay.getByRole("button", { name: "閉じる" }).click();
  await expect(overlay).toBeHidden();

  // Esc でも閉じる
  await page.getByRole("button", { name: "遊び方" }).click();
  await expect(overlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();
});

test("遊び方を開いて閉じたあと「新しいラン」でマップへ進む（ボタンが入れ子になっていない）", async ({
  page,
}) => {
  await page.goto("/?fx=0&seed=e2e-7");
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  const help = page.getByRole("button", { name: "遊び方" });
  const start = page.getByRole("button", { name: "新しいラン" });
  // 入れ子なら start が help の子孫になる
  await expect(help.getByRole("button")).toHaveCount(0);
  await expect(start.getByRole("button")).toHaveCount(0);

  await help.click();
  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.locator("#help-overlay")).toBeHidden();
  await start.click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
});

test("タイトル: シード入力はパネル配色で、『Log Dive』表記はHUD側に重複しない (#90)", async ({
  page,
}) => {
  await page.goto("/?fx=0&qa=1&seed=e2e-full-1");
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  const input = page.locator("#seed-input");
  await expect(input).toHaveCSS("background-color", "rgb(15, 26, 28)");
  await expect(input).toHaveCSS("border-top-color", "rgb(143, 169, 163)");
  const box = await input.boundingBox();
  expect(box?.height).toBe(40);
  await expect(page.locator("#hud h1")).toHaveCount(0);
  await expect(page.locator("#hud")).not.toContainText("Log Dive");
  const start = await page.getByRole("button", { name: "新しいラン" }).boundingBox();
  expect(start?.height).toBe(52);
});
