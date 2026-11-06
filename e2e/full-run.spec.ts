import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * 通し e2e: タイトル → 1階 → 2階 → 3階 → ボス撃破 → リザルト「復旧完了」。
 *
 * 手順は tests/unit/full-run-plan.test.ts が core/run.ts（正体を知っている BOT）から作った
 * e2e/fixtures/full-run-plan.json。ここでは同じ手を HUD のボタンで押し、
 * 1手ごとに data-scene と window.__qa.stateHash() が core の結果と一致することを確かめる。
 * → 画面の配線（ボタン→Action）と、ブラウザでもルールが決定的であることを同時に見る。
 */

type Press =
  | { readonly kind: "move"; readonly name: string }
  | { readonly kind: "button"; readonly names: readonly string[] };

interface Plan {
  readonly seed: string;
  readonly initialHash: string;
  readonly finalPhase: string;
  readonly steps: ReadonlyArray<{
    readonly action: unknown;
    readonly press: Press;
    readonly scene: string;
    readonly floor: number;
    readonly hash: string;
  }>;
}

const plan = JSON.parse(
  readFileSync(new URL("./fixtures/full-run-plan.json", import.meta.url), "utf8"),
) as Plan;

const escapeRe = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function press(page: Page, p: Press): Promise<void> {
  if (p.kind === "move") {
    await page
      .getByRole("navigation", { name: "隣の部屋" })
      .getByRole("button", { name: new RegExp(`^${escapeRe(p.name)}`) })
      .click();
    return;
  }
  for (const name of p.names) await page.getByRole("button", { name, exact: true }).click();
}

async function waitIdle(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__qa?.waitForIdle === "function");
  await page.evaluate(() => window.__qa!.waitForIdle());
}

const hashNow = (page: Page): Promise<string | null> =>
  page.evaluate(() => window.__qa!.stateHash());

test("通し: 1階→2階→3階→ボス撃破→リザルト（毎手 stateHash が core と一致・コンソールエラー0）", async ({
  page,
}) => {
  test.setTimeout(180_000);
  expect(plan.finalPhase).toBe("won");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await waitIdle(page);
  expect(await hashNow(page)).toBe(plan.initialHash);

  for (const [i, step] of plan.steps.entries()) {
    const where = `#${i} ${JSON.stringify(step.action)}`;
    await press(page, step.press);
    await expect(page.locator("body"), where).toHaveAttribute("data-scene", step.scene);
    await waitIdle(page);
    expect(await hashNow(page), where).toBe(step.hash);
  }

  await expect(page.getByRole("heading", { name: "復旧完了" })).toBeVisible();
  await expect(page.getByTestId("result-閉じたバグ票")).not.toHaveText("0");
  expect(errors).toEqual([]);
});
