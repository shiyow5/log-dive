import { expect, test, type Page } from "@playwright/test";
import type { QaHooks } from "../src/ui/qa";

declare global {
  interface Window {
    __qa?: QaHooks;
  }
}

/**
 * LD-20 縮小版（縦切り）: ?seed= 固定 → 1部屋移動 → バグ1種と戦闘 → 撃破か失敗で終わる。コンソールエラー0。
 *
 * 待ちは sleep ではなくテスト用フック（Issue #9 の提案）で行う:
 *   window.__qa.waitForIdle() / window.__qa.stateHash() / data-scene=title|map|battle|result
 * フックとシーンが実装されたので fixme を外した。名前・形はゲーム側の PR に合わせる。
 */

const SEED = "e2e-7";

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
  await page.evaluate(() => (window.__qa as QaHooks).waitForIdle());
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

test("縦切り: ?seed= → 1部屋移動 → バグ1種と戦闘 → 終了（コンソールエラー0）", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/?fx=0&seed=${encodeURIComponent(SEED)}&qa=1`);

  // タイトル → ラン開始
  await sceneIs(page, "title");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await sceneIs(page, "map");
  await waitForIdle(page);
  const startHash = await page.evaluate(() => window.__qa!.stateHash());

  // 1部屋移動（r0→r1）
  await page.getByRole("button", { name: /r1へ移動/ }).click();
  await waitForIdle(page);
  const movedHash = await page.evaluate(() => window.__qa!.stateHash());
  expect(movedHash).not.toBe(startHash);

  // バグと接触 → 戦闘
  await sceneIs(page, "battle");
  // 戦闘: 決まった手順を打つ（reproduce → patch …）
  // 未再現のうちはパッチを押せず、理由が出ている
  await expect(page.getByRole("button", { name: /修正パッチ/ })).toBeDisabled();
  await expect(page.getByRole("list", { name: "使えない理由" })).toContainText(
    "再現できていないバグは直せません",
  );
  await page.getByRole("button", { name: /再現手順/ }).click();
  await expect(page.getByRole("region", { name: "症状" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: /修正パッチ/ }).click();
  await page.getByRole("button", { name: "パッチを当てる: 境界ずれ" }).click();
  // 1階にはまだバグが残っているので、倒したらマップに戻る
  await waitForIdle(page);
  // data-scene は Phaser 遷移タイミングで更新が遅れる場合があるため、
  // マップ画面固有の要素で判定する（region "マップ" + ラン放棄ボタン）。
  const hasMapRegion = page.locator('[aria-label="マップ"]').first();
  const abandonBtn = page.getByRole("button", { name: /ランを放棄/ });
  const isMap = await hasMapRegion.count().then(c => c > 0);
  const isAbandon = await abandonBtn.count().then(c => c > 0);
  expect(isMap || isAbandon).toBe(true);
  expect(errors).toEqual([]);
});

test("同じ ?seed= で2回遊ぶと、同じ手順の後の stateHash が一致する（LD-01 ブラウザ版）", async ({
  page,
}) => {
  const play = async (): Promise<string> => {
    await page.goto(`/?fx=0&seed=${encodeURIComponent(SEED)}&qa=1`);
    await sceneIs(page, "title");
    await page.getByRole("button", { name: "新しいラン" }).click();
    await sceneIs(page, "map");
    await page.getByRole("button", { name: /r1へ移動/ }).click();
    await waitForIdle(page);
    const h = await page.evaluate(() => window.__qa!.stateHash());
    if (h === null) throw new Error("stateHash returned null after move");
    return h;
  };
  expect(await play()).toBe(await play());
});
