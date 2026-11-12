import { expect, test, type Page } from "@playwright/test";

/** Issue #118: 敗北リザルト（最後のバグ・誤パッチ・同じシードでもう一度）と、遊び方の症状表。 */
async function loseRun(page: Page): Promise<void> {
  await page.goto("/?fx=0&qa=1&seed=e2e-7");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await page.getByRole("button", { name: /r1へ移動/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");
  // 何もせずターンを終え続けると稼働率が尽きる
  for (let i = 0; i < 60; i++) {
    if ((await page.locator("body").getAttribute("data-scene")) === "result") return;
    await page.evaluate(() => window.__qa!.waitForIdle());
    // 画面が結果へ切り替わる最中はボタンが無い。押せなければ次の周回で scene を見直す
    await page
      .getByRole("button", { name: "ターン終了" })
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
  }
}

test("敗北: 最後のバグ・誤パッチ回数が出て、同じシードでもう一度が始められる", async ({ page }) => {
  await loseRun(page);
  await expect(page.locator("body")).toHaveAttribute("data-scene", "result");
  const d = page.getByTestId("result-defeat");
  await expect(d).toContainText("最後のバグ:");
  await expect(d).toContainText("誤パッチ: 0回");
  await expect(page.getByTestId("result-シード")).toHaveText("e2e-7");
  await page.screenshot({
    path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/defeat.png` : "test-results/defeat.png",
  });
  await page.getByRole("button", { name: "同じシードでもう一度" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
});

test("遊び方: 症状の読み方に「応答が遅い」はリークと無限ループの2種だけと出る", async ({
  page,
}) => {
  await page.goto("/?fx=0");
  await page.getByRole("button", { name: "遊び方" }).click();
  const overlay = page.locator("#help-overlay");
  await expect(
    overlay.getByRole("list", { name: "症状の読み方" }).getByRole("listitem"),
  ).toHaveCount(5);
  await expect(overlay).toContainText("「応答が遅い」はメモリリークと無限ループの2種だけ");
  await overlay.getByRole("list", { name: "症状の読み方" }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/help.png` : "test-results/help.png",
  });
});
