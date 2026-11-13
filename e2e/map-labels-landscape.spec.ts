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
    }

    // canvas内にピクセルが描かれている（空ではない）
    const imageData = await page.evaluate(
      (bw, bh) => {
        const c = document.querySelector("#game canvas") as HTMLCanvasElement;
        if (!c) return 0;
        const ctx = c.getContext("2d");
        if (!ctx) return 0;
        const d = ctx.getImageData(0, 0, bw, bh).data;
        let nonZero = 0;
        for (let i = 3; i < d.length; i += 4) {
          if (d[i] > 0) nonZero++;
        }
        return nonZero;
      },
      box!.width,
      box!.height,
    );
    expect(imageData).toBeGreaterThan(100); // 空白ではない
  });
}
