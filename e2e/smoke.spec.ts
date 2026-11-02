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

// 画面の導線確認（core/run.ts につないだ状態）。正式な smoke は T4（toru）。
test("?fx=0: タイトル→r1 移動→再現→パッチ→リザルト→タイトル", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?fx=0&seed=e2e");
  await expect(page.getByRole("textbox", { name: "シード" })).toHaveValue("e2e");
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
  await expect(page.locator("body")).toHaveAttribute("data-scene", "result");
  await expect(page.getByRole("heading", { name: "復旧完了" })).toBeVisible();
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
  await page.goto("/?fx=0&seed=e2e");
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
  await page.goto("/?seed=e2e");
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
