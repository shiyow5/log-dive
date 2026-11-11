import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * 戦闘HUD の受入条件（#87）: 2階の候補5件の戦闘で、1280×720 と 844×390 のどちらでも
 * 「ターン終了」が画面内に収まり、敵名・HP が見え、中段の初期 scrollTop が 0 であること。
 * 2階の戦闘へは full-run-plan.json の手順を再生して到達する（先頭の戦闘 = step 19）。
 */
type Press =
  | { readonly kind: "move"; readonly name: string }
  | { readonly kind: "button"; readonly names: readonly string[] };
interface Plan {
  readonly seed: string;
  readonly steps: ReadonlyArray<{
    readonly press: Press;
    readonly scene: string;
    readonly floor: number;
  }>;
}
const plan = JSON.parse(
  readFileSync(new URL("./fixtures/full-run-plan.json", import.meta.url), "utf8"),
) as Plan;

const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function press(page: Page, p: Press): Promise<void> {
  if (p.kind === "move") {
    await page
      .getByRole("navigation", { name: "隣の部屋" })
      .getByRole("button", { name: new RegExp(`^${esc(p.name)}`) })
      .click();
    return;
  }
  for (const name of p.names) await page.getByRole("button", { name, exact: true }).click();
}

const SIZES = [
  { width: 1280, height: 720 },
  { width: 844, height: 390 },
] as const;

test("戦闘HUD: 2階の戦闘で『ターン終了』が画面内・敵名とHPが見える・中段は先頭から", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  const firstFloor2Battle = plan.steps.findIndex((s) => s.floor === 2 && s.scene === "battle");
  for (const step of plan.steps.slice(0, firstFloor2Battle + 1)) {
    await press(page, step.press);
    await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
    await page.evaluate(() => window.__qa!.waitForIdle());
  }

  for (const vp of SIZES) {
    await page.setViewportSize(vp);
    const panel = page.getByRole("region", { name: "バトル" });
    await expect(panel).toBeVisible();
    const endTurn = page.getByRole("button", { name: "ターン終了", exact: true });
    const box = await endTurn.boundingBox();
    expect(box, `${vp.width}x${vp.height} ターン終了`).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
    // 敵名（部屋名 — 正体不明のバグ）と HP が上段に見える
    const head = panel.getByRole("heading", { level: 2 });
    await expect(head).toContainText("正体不明のバグ");
    await expect(head).toContainText(/HP \d+\/\d+/);
    const hb = await head.boundingBox();
    expect(hb!.y).toBeGreaterThanOrEqual(0);
    expect(hb!.y + hb!.height).toBeLessThanOrEqual(vp.height);
    // 中段は先頭から（下端始まりにしない）
    expect(await page.locator(".hud-battle-body").evaluate((e) => e.scrollTop)).toBe(0);
    // 候補は5件
    await expect(page.locator(".hud-cands li")).toHaveCount(5);
  }
});

test("戦闘HUD(#93): CPUが丸で出る・推奨枠は1つだけ・スキル2×2で高さ44px", async ({ page }) => {
  await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  const firstBattle = plan.steps.findIndex((s) => s.scene === "battle");
  for (const step of plan.steps.slice(0, firstBattle + 1)) {
    await press(page, step.press);
    await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
    await page.evaluate(() => window.__qa!.waitForIdle());
  }
  const dots = page.locator(".cpu-dot");
  expect(await dots.count()).toBeGreaterThan(0);
  await expect(page.locator(".cpu-dot.is-on")).not.toHaveCount(0);
  // 推奨枠（スキル＋ターン終了の合計）は常に 1 つ
  await expect(page.locator("#hud [data-recommended]")).toHaveCount(1);
  // 未再現の最初は「再現手順」が推奨
  await expect(page.locator(".hud-skills [data-recommended]")).toContainText("再現手順");
  const boxes = await page.locator(".hud-skills .hud-btn").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height) };
    }),
  );
  for (const b of boxes) expect(b.h).toBe(44);
  expect(new Set(boxes.map((b) => b.x)).size).toBeLessThanOrEqual(2);
});
