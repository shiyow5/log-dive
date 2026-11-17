import { expect, test, type Page } from "@playwright/test";

/** Issue #59 PR-1: 戦闘チュートリアル Step1。`?seed=` は QA フック（案内を出さない）なので、シードはタイトルの入力欄に書く。 */
async function enterFirstBattle(page: Page, url = "/?fx=0&qa=1"): Promise<void> {
  await page.goto(url);
  await page.locator("#seed-input").fill("e2e-7");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await page.locator(".map-tutorial").getByRole("button", { name: "スキップ" }).click();
  await page.getByRole("button", { name: /r1へ移動/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");
}

test("Reproduce を強調して案内し、押すと案内が消える（キーボードだけで完走）", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await enterFirstBattle(page);
  const bubble = page.locator(".battle-tutorial");
  await expect(bubble).toContainText("再現手順");
  const repro = page.locator(".hud-btn--tutorial");
  await expect(repro).toHaveCount(1);
  // ?fx=0 では脈動なし
  await expect(repro).not.toHaveClass(/hud-btn--pulse/);
  await page.screenshot({ path: process.env.SHOT_DIR + "/battle-tutorial-375.png" });
  await repro.focus();
  await page.keyboard.press("Enter");
  await expect(bubble).toHaveCount(0);
  await expect(page.locator(".hud-btn--tutorial")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("tutorial.battle"))).not.toBeNull();
});

test("スキップできる。タブで届き Enter で押せる", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await enterFirstBattle(page);
  const skip = page.locator(".battle-tutorial").getByRole("button", { name: "スキップ" });
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".battle-tutorial")).toHaveCount(0);
});

test("案内以外のボタン（ターン終了）を押しても案内は消えない", async ({ page }) => {
  await enterFirstBattle(page);
  const bubble = page.locator(".battle-tutorial");
  await page.getByRole("button", { name: "ターン終了" }).first().click();
  await expect(bubble).toHaveCount(1);
});
