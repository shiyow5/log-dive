import { test, expect } from "@playwright/test";

/** LD#102: 枠トークン（パネル外枠1px明色＋内側2px暗色、主ボタン=塗り＋明枠）。 */
test("LD#102: panel frame token and primary button", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const panel = page.locator(".hud-panel").first();
  await expect(panel).toBeVisible();
  const cs = await panel.evaluate((el) => {
    const c = getComputedStyle(el);
    return { b: c.borderTopColor, w: c.borderTopWidth, s: c.boxShadow };
  });
  expect(cs.w).toBe("1px");
  expect(cs.b).toBe("rgb(143, 169, 163)");
  expect(cs.s).toContain("rgb(7, 13, 14) 0px 0px 0px 2px inset");

  const primary = page.locator(".hud-btn--primary").first();
  await expect(primary).toBeVisible();
  expect(await primary.evaluate((el) => getComputedStyle(el).borderTopColor)).toMatch(
    /rgb\((228, 241, 236|232, 196, 104)\)/,
  );
});
