import { expect, test } from "@playwright/test";

// #121: スマホ縦持ちのマップ画面で、canvas が「画面高 − HUD パネル」をいっぱいに使い、HUD の下に空白を残さない。
// 部屋の大きさ・ラベルの大きさは tests/unit/map-labels.test.ts（計算）で確かめる。
const SIZES: [number, number][] = [
  [390, 844],
  [360, 740],
];
for (const [w, h] of SIZES) {
  test(`縦持ち ${w}x${h}: マップの canvas が HUD の直上まで広がり、HUD の下に空白がない (#121)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/?fx=0&seed=e2e-7");
    await page.getByRole("button", { name: "新しいラン" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
    const canvas = page.locator("#game canvas");
    await expect(canvas).toBeVisible();
    // canvas の高さは HUD を描いた後に決まるので、旧実装の高さ（画面の45%）を超えるまで待つ
    await expect.poll(async () => ((await canvas.boundingBox())?.height ?? 0) > h * 0.5).toBe(true);
    const c = (await canvas.boundingBox())!;
    const p = (await page.locator("#hud .hud-panel").first().boundingBox())!;
    expect(p.y - (c.y + c.height)).toBeGreaterThanOrEqual(0);
    expect(p.y - (c.y + c.height)).toBeLessThanOrEqual(16);
    expect(h - (p.y + p.height)).toBeLessThanOrEqual(16);
    // 旧実装は 390x844 で canvas が約 380px（画面高の 45%）。今は画面の半分以上を使う
    expect(c.height).toBeGreaterThan(h * 0.5);
  });
}
