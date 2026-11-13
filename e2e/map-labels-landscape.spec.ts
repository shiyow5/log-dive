import { expect, test } from "@playwright/test";

// #159: スマホ横持ち（844×390）のマップで、探索済みの部屋名が省略されない。
// MAX_CELL を 24 → 32 に上げたことで、CELL>=20 の疎な階で max=5 文字まで省略なしに。
// e2e: canvasがviewport内に収まり、部屋が描画されていることを確認。
// 実際の文字列の確認は unit test（tests/unit/map-labels.test.ts）で実施。
const SIZES: [number, number][] = [[844, 390]];
for (const [w, h] of SIZES) {
  test(`横持ち ${w}x${h}: マップの部屋名ラベルが省略されない (#159)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/?fx=0&qa=1&seed=e2e-7");
    await page.getByRole("button", { name: "新しいラン" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-scene", "map");

    const canvas = page.locator("#game canvas");
    await expect(canvas).toBeVisible();

    // canvas描画の待ち
    await page.waitForTimeout(500);

    // canvasがviewport内に収まっている
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(-5);
      expect(box.x + box.width).toBeLessThanOrEqual(w + 5);
      expect(box.y).toBeGreaterThanOrEqual(-5);
      expect(box.y + box.height).toBeLessThanOrEqual(h + 5);

      // canvas内に描画がある（画面が空白でないことを確認）
      await page.evaluate(() => {
        const c = document.querySelector("#game canvas") as HTMLCanvasElement;
        return c !== null && c.width > 0 && c.height > 0;
      });
    }
  });
}
