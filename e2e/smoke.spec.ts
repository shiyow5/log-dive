import { expect, test } from "@playwright/test";

function collectErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

test("起動してキャンバスが表示され、タイトルに進む（演出あり）", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.locator("#game canvas")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "新しいラン" })).toBeVisible();
  expect(errors).toEqual([]);
});

// 骨組みの導線確認（中身はスタブ）。正式な smoke は T4（toru）で core につないでから。
test("?fx=0: タイトル→移動→再現→パッチ→リザルト→タイトル", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?fx=0&seed=e2e");
  await expect(page.getByRole("textbox", { name: "シード" })).toHaveValue("e2e");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await page.getByRole("button", { name: /部屋2へ移動/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");
  await page.getByRole("button", { name: /再現手順/ }).click();
  await expect(page.getByRole("region", { name: "症状" })).toContainText("表示と1ずれる");
  await page.getByRole("button", { name: /修正パッチ/ }).click();
  await page.getByRole("button", { name: "パッチを当てる: 境界ずれ" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "result");
  await expect(page.getByRole("heading", { name: "復旧完了" })).toBeVisible();
  await page.getByRole("button", { name: "タイトルへ" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title");
  expect(errors).toEqual([]);
});

test("?fx=0: ランを放棄でリザルト", async ({ page }) => {
  await page.goto("/?fx=0");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await page.getByRole("button", { name: /ランを放棄/ }).click();
  await expect(page.getByRole("heading", { name: "ランを放棄した" })).toBeVisible();
});
