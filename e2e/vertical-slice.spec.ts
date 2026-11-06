import { expect, test, type Page } from "@playwright/test";

/**
 * LD-20 縮小版（縦切り）: ?seed= 固定 → 1部屋移動 → バグ1種と戦闘 → 撃破か失敗で終わる。コンソールエラー0。
 *
 * 待ちは sleep ではなくテスト用フック（Issue #9 の提案）で行う:
 *   window.__qa.waitForIdle() / window.__qa.stateHash() / data-scene=title|run|battle|result
 * フックとシーンが入るまでは test.fixme。名前・形はゲーム側（kirara・shingo）の PR に QA が合わせる。
 * 縦切り判定（11/04 21:00, qa-plan-v3 §3-1）までに fixme を外す。
 */

const SEED = "qa-e2e-1";

/** ページのエラーとコンソールの error を集める（smoke.spec.ts と同じ基準）。 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

async function waitForIdle(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__qa?.waitForIdle === "function");
  await page.evaluate(() => window.__qa!.waitForIdle());
}

async function sceneIs(page: Page, scene: string): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute("data-scene", scene, { timeout: 15_000 });
}

test("?seed= と ?fx=0 を付けても起動し、コンソールエラーが無い", async ({ page }) => {
  // ゲームがまだクエリを読まなくても、付けたことで壊れないことだけは今から確かめる
  const errors = collectErrors(page);
  await page.goto(`/?seed=${encodeURIComponent(SEED)}&fx=0`);
  await expect(page.locator("#game canvas")).toBeVisible();
  // シーン名は boot → title に変わる予定なので、ここでは「どれかのシーンが立ち上がった」ことだけ見る
  await expect(page.locator("body")).toHaveAttribute("data-scene", /\S/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test.fixme("縦切り: ?seed= → 1部屋移動 → バグ1種と戦闘 → 終了（コンソールエラー0）", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto(`/?seed=${encodeURIComponent(SEED)}&fx=0`);

  // タイトル → ラン開始
  await sceneIs(page, "title");
  await page.keyboard.press("Enter");
  await sceneIs(page, "run");
  await waitForIdle(page);
  const startHash = await page.evaluate(() => window.__qa!.stateHash());

  // 1部屋移動（キー割り当てはゲーム側に合わせて直す）
  await page.keyboard.press("ArrowRight");
  await waitForIdle(page);
  const movedHash = await page.evaluate(() => window.__qa!.stateHash());
  expect(movedHash).not.toBe(startHash);

  // バグと接触 → 戦闘
  await sceneIs(page, "battle");
  // 戦闘: 決まった手順を打つ（reproduce → patch …）。終わるまで上限つきで進める
  for (let i = 0; i < 30; i++) {
    const scene = await page.locator("body").getAttribute("data-scene");
    if (scene !== "battle") break;
    await page.keyboard.press("Enter");
    await waitForIdle(page);
  }

  // 撃破なら run に戻る / 失敗なら result。どちらでも「終わった」こと
  await expect(page.locator("body")).toHaveAttribute("data-scene", /^(run|result)$/);
  expect(errors).toEqual([]);
});

test.fixme("同じ ?seed= で2回遊ぶと、同じ手順の後の stateHash が一致する（LD-01 ブラウザ版）", async ({
  page,
}) => {
  const play = async (): Promise<string> => {
    await page.goto(`/?seed=${encodeURIComponent(SEED)}&fx=0`);
    await sceneIs(page, "title");
    await page.keyboard.press("Enter");
    await sceneIs(page, "run");
    await page.keyboard.press("ArrowRight");
    await waitForIdle(page);
    const h = await page.evaluate(() => window.__qa!.stateHash());
    if (h === null) throw new Error("stateHash returned null after move");
    return h;
  };
  expect(await play()).toBe(await play());
});
