import { expect, test } from "@playwright/test";

// 音（ZzFX / ZzFXM）。音そのものは聞けないので、切り替えボタンと「鳴らしてもエラーが出ない」ことを見る。

test("?fx=0 では音の切り替えボタンを出さない", async ({ page }) => {
  await page.goto("/?fx=0");
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await expect(page.locator("#audio-toggle")).toHaveCount(0);
});

test("音の切り替え: 押すとミュートになり、再読み込みしても残る。操作してもコンソールエラー0", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?seed=e2e-7");
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  const toggle = page.getByRole("button", { name: "音を切る" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  // SE と BGM を鳴らす操作（ランを始めて移動する）。zzfx は最初の操作のあとに読み込まれる
  const zzfxLoaded = page.waitForResponse((r) => /zzfx/i.test(r.url()) && r.ok());
  await page.getByRole("button", { name: "新しいラン" }).click();
  await zzfxLoaded;
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await page.getByRole("navigation", { name: "隣の部屋" }).getByRole("button").first().click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");

  await toggle.click();
  await expect(page.getByRole("button", { name: "音を出す" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "音を出す" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "音を出す" }).click();
  await expect(page.getByRole("button", { name: "音を切る" })).toBeVisible();
  expect(errors).toEqual([]);
});
