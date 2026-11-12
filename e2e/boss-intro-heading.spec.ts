import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * #158: ボス戦の導入文2行が、4解像度すべてで戦闘HUDのログ行に全文見える（切れない）。
 * 台本 full-run-plan.json（seed e2e-full-1）を再生し、3階ボス部屋の戦闘が始まった直後に確認する。
 */
type Press =
  | { readonly kind: "move"; readonly name: string }
  | { readonly kind: "button"; readonly names: readonly string[] };
interface Plan {
  readonly seed: string;
  readonly steps: ReadonlyArray<{ readonly press: Press; readonly scene: string }>;
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

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 800, height: 481 },
] as const;

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

for (const vp of VIEWPORTS) {
  test(`ボス戦見出し(#166): ${vp.width}x${vp.height} で導入文・候補/症状の見出し・HPバーが切れない`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(vp);
    await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
    await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
    await page.getByRole("button", { name: "新しいラン" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
    for (const step of plan.steps) {
      await press(page, step.press);
      await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
      await page.evaluate(() => window.__qa!.waitForIdle());
      const title =
        step.scene === "battle" ? await page.locator(".hud-battle-title h2").textContent() : "";
      if (title?.includes("根本原因 #BUG-000")) break;
    }
    await expect(page.locator(".hud-log")).toHaveText(
      /ここが、すべての障害の出どころだ。\s*ログが多すぎる。どのバグにも見える。/,
    );
    if (process.env.SHOTS)
      await page.screenshot({ path: `${process.env.SHOTS}/${vp.width}x${vp.height}.png` });

    // 対象の箱が、自分を切り取る全ての祖先（スクロール領域）と画面の内側に完全に収まっているか
    const clippedBy = async (selector: string, nth = 0): Promise<string[]> =>
      page
        .locator(selector)
        .nth(nth)
        .evaluate((node) => {
          const r = node.getBoundingClientRect();
          const problems: string[] = [];
          if (r.height === 0) problems.push("高さ0");
          if (r.top < 0 || r.bottom > window.innerHeight)
            problems.push(`viewport ${r.top}-${r.bottom}/${window.innerHeight}`);
          for (let e = node.parentElement; e; e = e.parentElement) {
            if (!/auto|scroll|hidden/.test(getComputedStyle(e).overflowY)) continue;
            if (getComputedStyle(e).display === "contents") continue;
            const c = e.getBoundingClientRect();
            if (r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5)
              problems.push(`${e.className || e.id} ${r.top}-${r.bottom} / ${c.top}-${c.bottom}`);
          }
          return problems;
        });
    expect(await clippedBy(".hud-log"), "導入文2行").toEqual([]);
    expect(await clippedBy('section[aria-label="候補"] h3'), "候補の見出し").toEqual([]);
    expect(await clippedBy('section[aria-label="症状"] h3'), "症状の見出し").toEqual([]);
    // 症状の本文（「まだ再現していない」）が最低1行、見出しの下で見えている
    const body = page.locator(
      'section[aria-label="症状"] .hud-stat, section[aria-label="症状"] li',
    );
    expect(await clippedBy('section[aria-label="症状"] .hud-stat'), "症状の1行目").toEqual([]);
    await expect(body.first()).toBeVisible();
    // 見出しは本文より上（本文が見出しの下に潜っていない）
    const order = await page.evaluate(() => {
      const h = document.querySelector('section[aria-label="症状"] h3')!.getBoundingClientRect();
      const t = document
        .querySelector('section[aria-label="症状"] .hud-stat')!
        .getBoundingClientRect();
      return { h: h.bottom, t: t.top };
    });
    expect(order.t, "症状の本文が見出しの下に潜っていない").toBeGreaterThanOrEqual(order.h - 0.5);

    // 操作列（スキル/パッチ）が高さ0に潰れず、スキルボタンに届く（Codex P2: 800×481）
    const act = await page.evaluate(() => {
      const a = document.querySelector(".hud-battle-actions")!;
      const b = a.querySelector("button")!;
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return { h: ar.height, bTop: br.top, bBottom: br.bottom, vh: window.innerHeight };
    });
    expect(act.h, "操作列の高さ").toBeGreaterThanOrEqual(100);
    expect(act.bBottom, "最初の操作ボタンが画面内").toBeLessThanOrEqual(act.vh);

    // HP バー・数値・『?』がドット絵の箱から 4px（ゲーム座標）以上離れ、重ならない
    const boxes = await page.evaluate(() => {
      const scene = window.__game!.scene.getScenes(true)[0] as unknown as {
        enemyImg: { getBounds(): Box };
        hpText: { getBounds(): Box };
        barX: number;
        children: { list: { type: string; text?: string; getBounds(): Box }[] };
      };
      const mark = scene.children.list.find((o) => o.type === "Text" && o.text === "?")!;
      const sp = scene.enemyImg.getBounds();
      const t = scene.hpText.getBounds();
      // バー本体（幅48・高さ4+目盛り2）。y は BattleScene の BAR_Y（= 8）
      const bar = { left: scene.barX, right: scene.barX + 48, top: 8, bottom: 14 };
      const q = mark.getBounds();
      const pick = (b: Box): Box => ({
        left: b.left,
        top: b.top,
        right: b.right,
        bottom: b.bottom,
      });
      return { sp: pick(sp), t: pick(t), bar, q: pick(q) };
    });
    const gap = (a: Box, b: Box): number =>
      Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
    expect(gap(boxes.bar, boxes.sp), "HPバーとドット絵の間隔").toBeGreaterThanOrEqual(4);
    expect(gap(boxes.t, boxes.sp), "HP数値とドット絵の間隔").toBeGreaterThanOrEqual(4);
    expect(gap(boxes.q, boxes.sp), "『?』とドット絵の間隔").toBeGreaterThanOrEqual(2);
  });
}
