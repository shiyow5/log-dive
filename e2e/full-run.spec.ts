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

  // #128: ボス戦の見出し・登場ログ・1回目パッチ後の一言（SHOTS=dir で証跡のスクショも撮る）
  const shot = async (name: string): Promise<void> => {
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
  };
  let bossHeading = false;
  let bossAppear = false;
  let bossPatched = false;
  for (const [i, step] of plan.steps.entries()) {
    const where = `#${i} ${JSON.stringify(step.action)}`;
    await press(page, step.press);
    await expect(page.locator("body"), where).toHaveAttribute("data-scene", step.scene);
    await waitIdle(page);
    expect(await hashNow(page), where).toBe(step.hash);
    if (step.scene === "battle") {
      const title = await page.locator(".hud-battle-title h2").textContent();
      if (title?.includes("根本原因 #BUG-000 — ")) {
        const log = (await page.locator(".hud-log").textContent()) ?? "";
        if (!bossHeading) await shot("boss-start");
        bossHeading = true;
        if (
          log.includes("ここが、すべての障害の出どころだ。\nログが多すぎる。どのバグにも見える。")
        )
          bossAppear = true;
        if (log.includes("効いた。でも、根が残っている。")) {
          if (!bossPatched) await shot("boss-patched");
          bossPatched = true;
        }
      } else {
        expect(title, where).toContain("正体不明のバグ");
      }
    }
  }
  expect([bossHeading, bossAppear, bossPatched]).toEqual([true, true, true]);

  await expect(page.getByRole("heading", { name: "復旧完了" })).toBeVisible();
  await expect(
    page.getByText(/障害の根本原因を閉じた。\s*サーバーは、静かになった。/),
  ).toBeVisible();
  await expect(page.getByText("夜が、明けていく。")).toBeVisible();
  await expect(page.getByText(/^全バグ票 \d+ 件クローズ$/)).toBeVisible();
  await expect(page.getByTestId("result-閉じたバグ票")).not.toHaveText("0");
  await shot("clear");
  expect(errors).toEqual([]);
});
