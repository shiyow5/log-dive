import { expect, test, type Page } from "@playwright/test";

// #101 / PR #182: マップで1歩動いても背景（壁・床・ビネットを合成した Image 1つ）が消えない。
// 以前は MapScene.clearMapObjects() が背景まで destroy していた（Codex P2）。
// seed=bd-0 は最初の移動（r0→r1）で戦闘にならず、マップのまま描き直される。
const SEED = "bd-0";
const SIZES: [number, number][] = [
  [390, 844],
  [1280, 720],
];
const EXPECTED = ["Image:ld-backdrop-map"];

type Obj = {
  type: string;
  active: boolean;
  texture?: { key: string };
  getData(k: string): unknown;
};

/** マップシーンに残っている背景オブジェクト（ld-backdrop の目印付き・未破棄）。 */
async function backdropObjects(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scene = window.__game!.scene.getScene("map") as unknown as {
      children: { list: Obj[] };
    };
    return scene.children.list
      .filter((o) => o.active && o.getData("ld-backdrop") === true)
      .map((o) => `${o.type}:${o.texture?.key ?? ""}`)
      .sort();
  });
}

for (const [w, h] of SIZES) {
  test(`${w}x${h}: マップで移動した後も背景（壁・床・ビネット）が残る (#101)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`/?fx=0&seed=${SEED}&qa=1`);
    await page.getByRole("button", { name: "新しいラン" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
    await page.evaluate(() => window.__qa!.waitForIdle());
    expect(await backdropObjects(page), "初期表示").toEqual(EXPECTED);

    const before = await page.evaluate(() => window.__qa!.stateHash());
    await page.getByRole("button", { name: /r1へ移動/ }).click();
    await page.evaluate(() => window.__qa!.waitForIdle());
    expect(await page.evaluate(() => window.__qa!.stateHash()), "移動した").not.toBe(before);
    await expect(page.locator("body")).toHaveAttribute("data-scene", "map");

    expect(await backdropObjects(page), "移動後").toEqual(EXPECTED);
  });
}
