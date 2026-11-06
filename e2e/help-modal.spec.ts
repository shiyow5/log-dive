import { expect, test } from "@playwright/test";

test("タイトル画面で「遊び方」ボタンを押すとパネルが開き、Escで閉じる", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });

  // 遊び方ボタンが表示されている
  await expect(page.getByRole("button", { name: "遊び方" })).toBeVisible();

  // クリックでパネルが開く
  await page.getByRole("button", { name: "遊び方" }).click({ force: true });

  // help-overlayが存在してvisibleになるまで待つ
  await page.waitForSelector("#help-overlay", { state: "visible", timeout: 5000 });
  await expect(page.locator("#help-overlay")).toBeVisible();

  // パネル内に目的の説明がある
  await expect(page.locator("#help-overlay h2")).toContainText("遊び方");
  await expect(page.locator("#help-overlay")).toContainText("3階のボスを倒して");
  await expect(page.locator("#help-overlay")).toContainText("ホットフィックス");
  await expect(page.locator("#help-overlay")).toContainText("パッチ");
  await expect(page.locator("#help-overlay")).toContainText("▼");
  await expect(page.locator("#help-overlay")).toContainText("◆");

  // 閉じるボタンで閉じる（force: canvasがpointer-eventsを占有しているため）
  await page.getByRole("button", { name: "閉じる" }).click({ force: true });

  // overlayが消えるまで待つ
  await page.waitForSelector("#help-overlay", { state: "hidden", timeout: 5000 });
  await expect(page.locator("#help-overlay")).toBeHidden();

  // Escでも閉じる（再度開いてテスト）
  await page.getByRole("button", { name: "遊び方" }).click({ force: true });
  await expect(page.locator("#help-overlay")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#help-overlay")).toBeHidden();
});
