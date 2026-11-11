import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * LD#126: 敗北リザルト（稼働率 0 — ダウン）の見出しが 844x390 で見切れ・はみ出ししないか、
 * getBoundingClientRect の実測値で PASS/FAIL を判定する。ブラウザごとに結果 JSON・スクショ・console を保存。
 */
test("敗北リザルト見出しが 844x390 に収まる", async ({ page, browserName }) => {
  const logs: string[] = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

  await page.goto("/?fx=0&qa=1&seed=e2e-7");
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  await page.getByRole("button", { name: /r1へ移動/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "battle");

  // ターン終了を繰り返して稼働率 0 → 敗北リザルトへ
  const endTurn = page.getByRole("button", { name: "ターン終了", exact: true });
  const body = page.locator("body");
  for (let i = 0; i < 60; i++) {
    if ((await body.getAttribute("data-scene")) === "result") break;
    if (await endTurn.isEnabled({ timeout: 500 }).catch(() => false)) {
      await endTurn.click({ timeout: 2000 }).catch(() => {});
    }
    await page.waitForTimeout(250);
  }
  await expect(page.locator("body")).toHaveAttribute("data-scene", "result");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveText("稼働率 0 — ダウン");
  await page.waitForTimeout(800);

  const m = await page.evaluate(() => {
    const h = document.querySelector("section[aria-label='リザルト'] h1") as HTMLElement;
    const r = h.getBoundingClientRect();
    const p = (h.parentElement as HTMLElement).getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(h);
    const lines = new Set(Array.from(range.getClientRects()).map((q) => Math.round(q.top))).size;
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom },
      panel: { x: p.x, y: p.y, right: p.right, bottom: p.bottom },
      scrollW: h.scrollWidth,
      clientW: h.clientWidth,
      lines,
      fontSize: getComputedStyle(h).fontSize,
    };
  });
  const checks = {
    inViewportX: m.rect.x >= 0 && m.rect.right <= m.vw,
    inViewportY: m.rect.y >= 0 && m.rect.bottom <= m.vh,
    insidePanelX: m.rect.x >= m.panel.x - 0.5 && m.rect.right <= m.panel.right + 0.5,
    noHorizontalOverflow: m.scrollW <= m.clientW + 1,
  };
  const pass = Object.values(checks).every(Boolean);

  mkdirSync("xb-results", { recursive: true });
  await page.screenshot({ path: `xb-results/defeat-${browserName}.png` });
  writeFileSync(`xb-results/console-${browserName}.log`, logs.join("\n") + "\n");
  writeFileSync(
    `xb-results/verdict-${browserName}.json`,
    JSON.stringify(
      { browser: browserName, verdict: pass ? "PASS" : "FAIL", checks, measured: m },
      null,
      2,
    ),
  );
  expect(checks, JSON.stringify(m)).toEqual({
    inViewportX: true,
    inViewportY: true,
    insidePanelX: true,
    noHorizontalOverflow: true,
  });
});
