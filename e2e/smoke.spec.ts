import { expect, test } from "@playwright/test";

function collectErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

test("起動してキャンバスが表示され、タイトルに進む（演出あり）", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.locator("#game canvas")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "新しいラン" })).toBeVisible();
  expect(errors).toEqual([]);
});

// 画面の導線確認（core/run.ts につないだ状態）。
// シード e2e-7: 1階は r0 の隣が r1 だけで、r1 に境界ずれ（off-by-one）が1体（generateFloor で決まる）。
test("?fx=0: タイトル→r1 移動→再現→パッチ→マップに戻る→放棄→リザルト→タイトル", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/?fx=0&seed=e2e-7");
  await expect(page.getByRole("textbox", { name: "シード" })).toHaveValue("e2e-7");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await page.getByRole("button", { name: /r1へ移動/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");
  // 未再現のうちはパッチを押せず、理由が出ている
  await expect(page.getByRole("button", { name: /修正パッチ/ })).toBeDisabled();
  await expect(page.getByRole("list", { name: "使えない理由" })).toContainText(
    "再現できていないバグは直せません",
  );
  await page.getByRole("button", { name: /再現手順/ }).click();
  await expect(page.getByRole("region", { name: "症状" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: /修正パッチ/ }).click();
  await page.getByRole("button", { name: "パッチを当てる: 境界ずれ" }).click();
  // 1階にはまだバグが残っているので、倒したらマップに戻る（階段はまだ開かない）
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await expect(page.getByRole("status")).toContainText("バグ票を閉じた");
  await page.getByRole("button", { name: /ランを放棄/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "result");
  await expect(page.getByTestId("result-閉じたバグ票")).toHaveText("1");
  await page.getByRole("button", { name: "タイトルへ" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title");
  expect(errors).toEqual([]);
});

test("?fx=0: ランを放棄でリザルト", async ({ page }) => {
  await page.goto("/?fx=0");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await page.getByRole("button", { name: /ランを放棄/ }).click();
  await expect(page.getByRole("heading", { name: "ランを放棄した" })).toBeVisible();
});

test("?fx=0: 隣の部屋だけ移動ボタンが出て、スキルの結果がログに出る", async ({ page }) => {
  await page.goto("/?fx=0&seed=e2e-7");
  await page.getByRole("button", { name: "新しいラン" }).click();
  // r0 main() の隣は r1 だけ
  await expect(page.getByRole("navigation", { name: "隣の部屋" }).getByRole("button")).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: /r1へ移動/ }).click();
  await page.getByRole("button", { name: /ホットフィックス/ }).click();
  await expect(page.getByRole("status")).toHaveText("バグに 3 ダメージ");
});

test("演出あり: 戦闘のグリッチが終わるとフォーカスが HUD に戻り、キーボードだけで操作できる", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?seed=e2e-7");
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await page.getByRole("navigation", { name: "隣の部屋" }).getByRole("button").first().click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");
  // 演出中は inert、終わったら解除される
  await expect(page.locator("#hud")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#hud")).not.toHaveAttribute("inert");
  const first = page.getByRole("button", { name: /再現手順/ });
  await expect(first).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "症状" }).getByRole("listitem")).toHaveCount(1);
  expect(errors).toEqual([]);
});

/**
 * Issue #30: スキルボタンが描画され、legalActions に無いボタンが無効になる。
 *
 * starter スキル（再現手順・ログ確認・ホットフィックス）は常に押せるが、
 * 修正パッチは未再現なら disabled になることを確認。
 * breakpoint/bisect は starter=false なので初期スキルに含まれず、ボタンに出ない。
 */
test("スキル6枚の内 starter が描画され、使えないスキルは disabled になる (#30)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/?fx=0&seed=e2e-7");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await page.getByRole("button", { name: /r1へ移動/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");

  // starterスキル3つが描画される
  await expect(page.getByRole("button", { name: /再現手順/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /ログ確認/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /ホットフィックス/ })).toBeVisible();

  // 修正パッチは描画されるが未再現なのでdisabled
  const patchBtn = page.getByRole("button", { name: /修正パッチ/ });
  await expect(patchBtn).toBeVisible();
  await expect(patchBtn).toBeDisabled();

  // breakpoint/bisect は starter=false なので存在しない
  await expect(page.getByRole("button", { name: /ブレークポイント/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /二分探索/ })).toHaveCount(0);

  // 使えない理由がリストに出ている
  await expect(page.getByRole("list", { name: "使えない理由" })).toContainText(
    "再現できていないバグは直せません",
  );

  expect(errors).toEqual([]);
});
