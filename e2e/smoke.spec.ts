import { expect, test } from "@playwright/test";

test("起動してキャンバスが表示され、コンソールエラーが無い", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.locator("#game canvas")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "boot", { timeout: 15_000 });
  expect(errors).toEqual([]);
});
