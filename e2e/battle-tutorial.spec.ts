import { expect, test, type Page } from "@playwright/test";

/**
 * Issue #59: 戦闘チュートリアル（① 再現 → ② ログで絞る → ③ パッチ）。
 * `?seed=` は QA フック（案内を出さない）なので、通常は seed をタイトルの入力欄に書く。
 * 固定 seed で出したいときは `?seed=N&tutorial=battle` と明示する。
 */
const SHOT_DIR = process.env.SHOT_DIR ?? "test-results";

async function enterFirstBattle(page: Page, url = "/?fx=0&qa=1"): Promise<void> {
  await page.goto(url);
  await page.locator("#seed-input").fill("e2e-7");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  const mapSkip = page.locator(".map-tutorial").getByRole("button", { name: "スキップ" });
  if (await mapSkip.count()) await mapSkip.click();
  await page.getByRole("button", { name: /r1へ移動/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");
}

const bubble = (page: Page) => page.locator(".battle-tutorial");
const glowing = (page: Page) => page.locator(".hud-btn--tutorial");
const saved = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test("① 再現 → ② ログ確認 → ③ パッチ を1手ずつ強調。ボタンだけ押して最後まで進める", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await enterFirstBattle(page);
  // ①
  await expect(bubble(page)).toContainText("再現手順");
  await expect(glowing(page)).toHaveCount(1);
  await expect(glowing(page)).toHaveText(/再現手順/);
  await expect(glowing(page)).not.toHaveClass(/hud-btn--pulse/); // ?fx=0 は静的な枠だけ
  await page.screenshot({ path: `${SHOT_DIR}/battle-tutorial-step1-375.png` });
  await glowing(page).focus();
  await page.keyboard.press("Enter");
  // ②
  await expect(bubble(page)).toContainText("ログ確認");
  await expect(glowing(page)).toHaveText(/ログ確認/);
  await page.screenshot({ path: `${SHOT_DIR}/battle-tutorial-step2-375.png` });
  await glowing(page).focus();
  await page.keyboard.press("Enter");
  // ③ 初期 CPU 3 のうち再現・ログ確認で2使うので、先に「ターン終了」で CPU を回復する案内に切り替わる（行き止まりにしない）
  await expect(bubble(page)).toContainText("CPU が足りません");
  await expect(glowing(page)).toHaveText(/ターン終了/);
  await page.screenshot({ path: `${SHOT_DIR}/battle-tutorial-step3-cpu-375.png` });
  await glowing(page).focus();
  await page.keyboard.press("Enter");
  await expect(bubble(page)).toContainText("修正パッチ");
  await expect(glowing(page)).toHaveText(/修正パッチ/);
  await page.screenshot({ path: `${SHOT_DIR}/battle-tutorial-step3-375.png` });
  expect(await saved(page, "tutorial.battle_complete")).toBeNull();
  // パッチを当てる（種類の選択もキーボードで。）
  await glowing(page).focus();
  await page.keyboard.press("Enter");
  const picker = page.getByRole("group", { name: "パッチの種類" });
  await expect(picker.getByRole("button").first()).toBeFocused();
  await expect(bubble(page)).toHaveCount(1); // 選ぶ途中でも案内は消えない
  // ログ確認で候補は1つ（正解）に絞れているので、そのままキーボードで確定する
  await expect(picker.getByRole("button")).toHaveCount(2); // 候補 + やめる
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).not.toHaveAttribute("data-scene", "battle");
  expect(await saved(page, "tutorial.battle_complete")).not.toBeNull();
  expect(await saved(page, "tutorial.battle_skipped")).toBeNull();
});

test("スキップはタブで届き Enter で押せる。タップ領域は44px以上。skipped だけ保存され、2回目は出ない", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterFirstBattle(page);
  const skip = bubble(page).getByRole("button", { name: "スキップ" });
  const box = await skip.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `${SHOT_DIR}/battle-tutorial-step1-390.png` });
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(bubble(page)).toHaveCount(0);
  await expect(glowing(page)).toHaveCount(0);
  expect(await saved(page, "tutorial.battle_skipped")).not.toBeNull();
  expect(await saved(page, "tutorial.battle_complete")).toBeNull();
  // 2回目（同じ localStorage でもう一度戦闘に入る）
  await page.reload();
  await enterFirstBattle(page);
  await expect(bubble(page)).toHaveCount(0);
});

test("案内以外のボタン（ターン終了）を押しても案内は消えず、段も戻らない", async ({ page }) => {
  await enterFirstBattle(page);
  await page.getByRole("button", { name: "ターン終了" }).first().click();
  await expect(bubble(page)).toHaveCount(1);
  await expect(bubble(page)).toContainText("再現手順");
});

for (const width of [375, 390]) {
  test(`案内文が、ボタン・HUD と重ならない（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await enterFirstBattle(page);
    const b = await bubble(page).boundingBox();
    expect(b).not.toBeNull();
    for (const sel of [".hud-battle-foot button", ".hud-btn--tutorial"]) {
      const o = await page.locator(sel).first().boundingBox();
      expect(o).not.toBeNull();
      const overlap =
        b!.x < o!.x + o!.width &&
        o!.x < b!.x + b!.width &&
        b!.y < o!.y + o!.height &&
        o!.y < b!.y + b!.height;
      expect(overlap, `${sel} と重なっている`).toBe(false);
    }
    expect(b!.x + b!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `${SHOT_DIR}/battle-tutorial-layout-${width}.png` });
  });
}

test("?seed=N&tutorial=battle で強制表示。保存済みでも出て、フラグは書かない", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tutorial.battle_skipped", "x"));
  await enterFirstBattle(page, "/?fx=0&qa=1&seed=e2e-7&tutorial=battle");
  await expect(bubble(page)).toContainText("再現手順");
  await bubble(page).getByRole("button", { name: "スキップ" }).click();
  await expect(bubble(page)).toHaveCount(0);
  expect(await saved(page, "tutorial.battle_complete")).toBeNull();
});

test("?seed=N だけ（強制なし）では案内を出さない（QA フック）", async ({ page }) => {
  await enterFirstBattle(page, "/?fx=0&qa=1&seed=e2e-7");
  await expect(bubble(page)).toHaveCount(0);
  await expect(glowing(page)).toHaveCount(0);
});

test("視差軽減（prefers-reduced-motion）でも表示・操作でき、脈動しない", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterFirstBattle(page, "/?qa=1");
  await expect(bubble(page)).toContainText("再現手順");
  await expect(glowing(page)).toHaveCount(1);
  await expect(glowing(page)).not.toHaveClass(/hud-btn--pulse/);
  await glowing(page).click();
  await expect(bubble(page)).toContainText("ログ確認");
});
