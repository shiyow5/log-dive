import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * #179: 戦闘画面（HUD と放棄モーダル）に 14px 未満の文字を残さない（補足 ≥14px）。
 * 敵名（h2）は全サイズで 16px 以上。#177 の基準「本文16 / 補足14」に合わせる。
 */
interface Plan {
  readonly seed: string;
  readonly steps: ReadonlyArray<{
    readonly press:
      | { readonly kind: "move"; readonly name: string }
      | { readonly kind: "button"; readonly names: readonly string[] };
    readonly scene: string;
    readonly floor: number;
  }>;
}
const plan = JSON.parse(
  readFileSync(new URL("./fixtures/full-run-plan.json", import.meta.url), "utf8"),
) as Plan;
const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const;

test("戦闘画面(#179): 4サイズで 14px 未満の文字が 0 件・敵名は 16px 以上", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await page.getByRole("button", { name: "新しいラン" }).click();
  const first = plan.steps.findIndex((s) => s.floor === 2 && s.scene === "battle");
  for (const step of plan.steps.slice(0, first + 1)) {
    const p = step.press;
    if (p.kind === "move") {
      await page
        .getByRole("navigation", { name: "隣の部屋" })
        .getByRole("button", { name: new RegExp(`^${esc(p.name)}`) })
        .click();
    } else {
      for (const n of p.names) await page.getByRole("button", { name: n, exact: true }).click();
    }
    await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
    await page.evaluate(() => window.__qa!.waitForIdle());
  }
  const small = (): Promise<string[]> =>
    page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll<HTMLElement>("#hud *").forEach((e) => {
        const own = Array.from(e.childNodes).some(
          (n) => n.nodeType === 3 && n.textContent!.trim() !== "",
        );
        const b = e.getBoundingClientRect();
        if (!own || b.width < 2 || b.height < 2) return;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs < 14)
          out.push(`${e.tagName}.${e.className}:${e.textContent!.trim().slice(0, 16)}=${fs}`);
      });
      return out;
    });
  for (const vp of SIZES) {
    await page.setViewportSize(vp);
    expect(await small(), `${vp.width}x${vp.height} 14px 未満`).toEqual([]);
    const h2 = await page
      .getByRole("region", { name: "バトル" })
      .getByRole("heading", { level: 2 })
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(h2, `${vp.width}x${vp.height} 敵名`).toBeGreaterThanOrEqual(16);
    await page.getByRole("button", { name: /^ランを放棄/ }).click();
    expect(await small(), `${vp.width}x${vp.height} 放棄モーダル 14px 未満`).toEqual([]);
    await page.keyboard.press("Escape");
  }
});
