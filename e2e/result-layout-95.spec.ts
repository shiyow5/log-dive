import { expect, test, type Page } from "@playwright/test";

/**
 * Issue #95: リザルトのレイアウト（minori 指定値 11/10 14:14 ＋ sota 11/16 の差分。前回比は 11/17 rei 判断で実装）。
 * 放棄リザルトで、結果表4行・一言ヒント・主/副ボタンの寸法・背景の敵ドット絵・同じシードの引き継ぎを見る。
 */
async function abandonRun(page: Page, seed: string): Promise<void> {
  await page.goto(`/?fx=0&qa=1&seed=${seed}`);
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await page.getByRole("button", { name: /ランを放棄/ }).click();
  await page.getByRole("button", { name: /放棄する/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "result");
}

test("放棄リザルト: 指定どおりの表・ヒント・ボタン・背景絵で、同じシードでもう一度が始められる", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await abandonRun(page, "e2e-95");
  const panel = page.getByRole("region", { name: "リザルト" });
  await expect(panel.locator("dt")).toHaveText([
    "到達階",
    "倒したバグ",
    "使ったターン",
    "今回のシード",
  ]);
  await expect(page.getByTestId("result-到達階")).toHaveText("1階");
  await expect(page.getByTestId("result-今回のシード")).toHaveText("e2e-95");
  await expect(page.getByTestId("result-hint")).toHaveText("次は再現してから修正してみよう");

  const pb = (await panel.boundingBox())!;
  expect(pb.width).toBeLessThanOrEqual(560);
  const row = (await panel.locator(".result-row").first().boundingBox())!;
  expect(row.height).toBeGreaterThanOrEqual(36);

  const primary = page.getByRole("button", { name: "同じシードでもう一度" });
  const secondary = page.getByRole("button", { name: "タイトルへ" });
  const a = (await primary.boundingBox())!;
  const b = (await secondary.boundingBox())!;
  expect([Math.round(a.width), Math.round(a.height)]).toEqual([220, 44]);
  expect([Math.round(b.width), Math.round(b.height)]).toEqual([160, 44]);
  expect(Math.round(b.x - (a.x + a.width))).toBe(16);
  await expect(primary).toHaveCSS("background-color", "rgb(232, 196, 104)");
  await expect(primary).toHaveCSS("color", "rgb(15, 26, 28)");
  await expect(primary).toBeFocused();

  const sprite = page.getByTestId("result-sprite");
  await expect(sprite).toHaveCSS("opacity", "0.12");
  const sb = (await sprite.boundingBox())!;
  expect([Math.round(sb.width), Math.round(sb.height)]).toEqual([256, 256]);
  // パネルの中央
  expect(Math.abs(sb.x + sb.width / 2 - (pb.x + pb.width / 2))).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: process.env.SHOT_DIR
      ? `${process.env.SHOT_DIR}/result-95-1280.png`
      : "test-results/result-95-1280.png",
  });

  await primary.click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await page.getByRole("button", { name: /ランを放棄/ }).click();
  await page.getByRole("button", { name: /放棄する/ }).click();
  await expect(page.getByTestId("result-今回のシード")).toHaveText("e2e-95");
});

test("SP(390x844): ボタンは縦積み・主が上・幅いっぱい・gap 12px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abandonRun(page, "e2e-95");
  const a = (await page.getByRole("button", { name: "同じシードでもう一度" }).boundingBox())!;
  const b = (await page.getByRole("button", { name: "タイトルへ" }).boundingBox())!;
  expect(a.y).toBeLessThan(b.y);
  expect(Math.round(b.y - (a.y + a.height))).toBe(12);
  expect(Math.round(a.width)).toBe(Math.round(b.width));
  expect(Math.round(a.height)).toBe(44);
  await page.screenshot({
    path: process.env.SHOT_DIR
      ? `${process.env.SHOT_DIR}/result-95-390.png`
      : "test-results/result-95-390.png",
  });
});

test("844x390: 主ボタンも画面内に収まる", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await abandonRun(page, "e2e-95");
  for (const name of ["同じシードでもう一度", "タイトルへ"]) {
    const box = (await page.getByRole("button", { name }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(390);
  }
});

test("前回比: 初回・壊れた記録では出さず例外も出ない。2回目は値の右に記号付きで出る", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?fx=0&qa=1&seed=e2e-95d");
  await page.evaluate(() => localStorage.setItem("log-dive:prev-run", "{broken"));
  await abandonRun(page, "e2e-95d");
  await expect(page.getByTestId("result-到達階")).toHaveText("1階");
  await expect(page.locator(".result-diff")).toHaveCount(0);

  await page.getByRole("button", { name: "同じシードでもう一度" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await page.getByRole("button", { name: /ランを放棄/ }).click();
  await page.getByRole("button", { name: /放棄する/ }).click();
  await expect(page.getByTestId("result-到達階")).toHaveText("1階");
  const diff = page.getByTestId("result-diff-到達階");
  await expect(diff).toHaveText("前回比 ±0 階");
  await expect(diff).toHaveCSS("font-size", "14px");
  await expect(page.getByTestId("result-diff-倒したバグ")).toHaveText("前回比 ±0");
  await expect(page.getByTestId("result-diff-今回のシード")).toHaveCount(0);
  // 値の右に並ぶ
  const v = (await page.getByTestId("result-到達階").boundingBox())!;
  const d = (await diff.boundingBox())!;
  expect(d.x).toBeGreaterThan(v.x + v.width);
  expect(errors).toEqual([]);
});
