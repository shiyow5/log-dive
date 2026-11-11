import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Issue #122: ボス撃破後のリザルトに、戦闘の HP バー・撃破演出の破片が残らない。
 * full-run と同じ手でリザルトまで進め（演出あり）、canvas に戦闘の HP バー色(#ff6b5e)が無いことを見る。
 */
interface Step {
  readonly press:
    | { readonly kind: "move"; readonly name: string }
    | { readonly kind: "button"; readonly names: readonly string[] };
}
const plan = JSON.parse(
  readFileSync(new URL("./fixtures/full-run-plan.json", import.meta.url), "utf8"),
) as { seed: string; steps: Step[] };

const escapeRe = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function reachResult(page: Page): Promise<void> {
  await page.goto(`/?qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await page.getByRole("button", { name: "新しいラン" }).click();
  for (const { press } of plan.steps) {
    await page.evaluate(() => window.__qa!.waitForIdle());
    if (press.kind === "move") {
      await page
        .getByRole("navigation", { name: "隣の部屋" })
        .getByRole("button", { name: new RegExp(`^${escapeRe(press.name)}`) })
        .click();
    } else {
      for (const n of press.names) await page.getByRole("button", { name: n, exact: true }).click();
    }
  }
  await expect(page.locator("body")).toHaveAttribute("data-scene", "result");
}

/** 戦闘の HP バー（BUG_POS の 26 ドット下・幅 48・高さ 4）の範囲にある #ff6b5e に近い画素数。
 * 「QUEST COMPLETE」のリボンも赤いので、バーの位置だけを見る */
async function redBarPixels(page: Page): Promise<number> {
  const png = await page.locator("canvas").first().screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const k = c.width / 320;
    const d = ctx.getImageData(
      Math.floor(136 * k),
      Math.floor(68 * k),
      Math.ceil(48 * k),
      Math.ceil(8 * k),
    ).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (
        Math.abs(d[i]! - 255) < 12 &&
        Math.abs(d[i + 1]! - 107) < 12 &&
        Math.abs(d[i + 2]! - 94) < 12
      )
        n++;
    return n;
  }, png.toString("base64"));
}

for (const vp of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`リザルトに戦闘の HP バーが残らない ${vp.width}x${vp.height}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(vp);
    await reachResult(page);
    await expect(page.getByRole("heading", { name: "復旧完了" })).toBeVisible();
    await expect(page.getByTestId("result-ターン終了の回数")).toBeVisible();
    await page.waitForTimeout(800);
    expect(await redBarPixels(page)).toBe(0);
  });
}

// #126 残P2: 「タイトルへ」は h>=44 で、横持ちスマホ(844×390)でも下端が画面内に収まる。
test("リザルト: タイトルへが h>=44 で 844x390 の画面内に収まる", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 844, height: 390 });
  await reachResult(page);
  const box = await page.getByRole("button", { name: "タイトルへ" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.y + box!.height).toBeLessThanOrEqual(390);
});
