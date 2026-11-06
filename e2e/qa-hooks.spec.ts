import { expect, test } from "@playwright/test";

/**
 * Issue #9: window.__qa stateHash / waitForIdle / scene の e2e テスト。
 * ?seed=qa-e2e-1&fx=0&qa=1 で開き、data-scene=title を待つ →
 * waitForIdle() が resolve → stateHash() が文字列を返す（ラン未開始なら null）、
 * コンソールエラー0。
 */

function collectErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

async function waitForQaIdle(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__qa?.waitForIdle === "function");
  await page.evaluate(() => window.__qa!.waitForIdle());
}

test("__qa: stateHash と waitForIdle が存在し、scene() がタイトルを返す（ラン未開始）", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("?seed=qa-e2e-1&fx=0&qa=1");
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });

  // __qa が定義されている
  await page.waitForFunction(() => typeof window.__qa !== "undefined");
  expect(await page.evaluate(() => typeof window.__qa!.stateHash)).toBe("function");
  expect(await page.evaluate(() => typeof window.__qa!.waitForIdle)).toBe("function");
  expect(await page.evaluate(() => typeof window.__qa!.scene)).toBe("function");

  // waitForIdle が即 resolve
  await waitForQaIdle(page);

  // stateHash() は null（ラン未開始）
  expect(await page.evaluate(() => window.__qa!.stateHash())).toBeNull();

  // scene() は "title"
  expect(await page.evaluate(() => window.__qa!.scene())).toBe("title");

  expect(errors).toEqual([]);
});

test("__qa: ラン開始後、stateHash() が 8 文字の hex を返す", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("?seed=qa-e2e-1&fx=0&qa=1");
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });

  // ラン開始
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await waitForQaIdle(page);

  // stateHash() が文字列を返す（8文字のhex）
  const hash = await page.evaluate(() => window.__qa!.stateHash());
  expect(hash).toMatch(/^[0-9a-f]{8}$/);

  expect(errors).toEqual([]);
});

test("__qa: 同じシードで2回プレイすると stateHash が一致する", async ({ page }) => {
  const seedHash = async (seed: string): Promise<string> => {
    await page.goto(`?seed=${seed}&fx=0&qa=1`);
    await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
    await page.getByRole("button", { name: "新しいラン" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
    await waitForQaIdle(page);
    return (await page.evaluate(() => window.__qa!.stateHash())) as string;
  };
  const h1 = await seedHash("qa-e2e-1");
  const h2 = await seedHash("qa-e2e-1");
  expect(h1).toBe(h2);
});

test("__qa: 操作中の waitForIdle は完了し、stateHash が更新される", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("?seed=qa-e2e-1&fx=0&qa=1");
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });

  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await waitForQaIdle(page);

  const hash1 = await page.evaluate(() => window.__qa!.stateHash());

  // 移動する
  await page.getByRole("button", { name: /r1へ移動/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");
  await waitForQaIdle(page);

  // stateHash が更新される
  const hash2 = await page.evaluate(() => window.__qa!.stateHash());
  expect(hash2).not.toBe(hash1);

  expect(errors).toEqual([]);
});
