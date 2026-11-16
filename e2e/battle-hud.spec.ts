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

/**
 * #111: 1280×720 で敵の赤い HP バー（#ff6b5e・満タンで横 192px 連続）が HUD パネル上端より上に見える。
 * 虫のドット絵は同色でも横の連続が約 108px までなので、150px 以上の連続でバーと見分ける。
 */
async function expectEnemyHpBarAbovePanel(
  page: Page,
  panel: ReturnType<Page["getByRole"]>,
): Promise<void> {
  const top = Math.floor((await panel.boundingBox())!.y);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: top } });
  const found = await page.evaluate(
    async ([b64, h]) => {
      const bin = atob(b64 as string);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = cv.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, bmp.width, h as number).data;
      for (let y = 0; y < (h as number); y++) {
        let run = 0;
        for (let x = 0; x < bmp.width; x++) {
          const i = (y * bmp.width + x) * 4;
          run = d[i] === 255 && d[i + 1] === 107 && d[i + 2] === 94 ? run + 1 : 0;
          if (run >= 150) return true;
        }
      }
      return false;
    },
    [png.toString("base64"), top] as const,
  );
  expect(found, "1280 で敵の HP バーが HUD パネルの上に見える").toBe(true);
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
    // #92: HP の数字は敵のバー横（canvas）に1か所だけ。見出しには画面外の読み上げ用だけ残す
    const hpSr = head.locator(".visually-hidden");
    await expect(hpSr).toHaveText(/敵の HP \d+\/\d+/);
    const sr = await hpSr.boundingBox();
    expect(sr!.width, "見出しの HP は視覚的に出さない").toBeLessThanOrEqual(1);
    const hb = await head.boundingBox();
    expect(hb!.y).toBeGreaterThanOrEqual(0);
    expect(hb!.y + hb!.height).toBeLessThanOrEqual(vp.height);
    // 中段は先頭から（下端始まりにしない）。#158 でログ行を見せるための送りは1行未満（余白ぶん）だけ許す
    expect(await page.locator(".hud-battle-body").evaluate((e) => e.scrollTop)).toBeLessThan(24);
    // 候補は4件（2階は leak を除く。#118 論点1=1-B）
    await expect(page.locator(".hud-cands li")).toHaveCount(4);
    // 中段の初期表示で「症状」の見出しが画面内に入る（#142 差し戻し: 844×390 で見切れていた）
    const symH = await page
      .getByRole("region", { name: "症状" })
      .getByRole("heading", { level: 3 })
      .boundingBox();
    expect(symH, `${vp.width}x${vp.height} 症状の見出し`).not.toBeNull();
    expect(symH!.y).toBeGreaterThanOrEqual(0);
    expect(symH!.y + symH!.height).toBeLessThanOrEqual(vp.height);
    if (vp.width === 1280) await expectEnemyHpBarAbovePanel(page, panel);
  }
});

test("戦闘HUD(#93): CPUが丸で出る・推奨枠は1つだけ・スキルは列を揃えて高さ44px", async ({
  page,
}) => {
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
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        h: Math.round(r.height),
        why: e.classList.contains("hud-btn--why"),
      };
    }),
  );
  // 理由つきの無効ボタンだけ 52px（#94: 2行目の理由の分）。それ以外は 44px
  for (const b of boxes) expect(b.h).toBe(b.why ? 52 : 44);
  expect(new Set(boxes.map((b) => b.x)).size).toBeLessThanOrEqual(3); // #142: 広い画面は 3 列
});

/**
 * #94: 押せないボタンの理由はボタン内2行目に出す。文字 #a9c2bc（6:1 以上）・2px 破線・opacity なし。
 * 最下段の理由リストは無い。全文は aria-describedby とホバーのツールチップ。
 */
test("戦闘HUD(#94): 押せないボタンの理由がボタン内2行目に出る", async ({ page }) => {
  await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  const firstBattle = plan.steps.findIndex((s) => s.scene === "battle");
  for (const step of plan.steps.slice(0, firstBattle + 1)) {
    await press(page, step.press);
    await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
    await page.evaluate(() => window.__qa!.waitForIdle());
  }
  const patch = page.getByRole("button", { name: /修正パッチ/ });
  await expect(patch).toBeDisabled();
  const why = patch.locator(".hud-why");
  await expect(why).toHaveText("再現が必要");
  await expect(why).toBeVisible();
  await expect(patch).toHaveAccessibleDescription("再現できていないバグは直せません");
  await expect(page.getByRole("list", { name: "使えない理由" })).toHaveCount(0);

  const st = await patch.evaluate((e) => {
    const c = getComputedStyle(e);
    const w = getComputedStyle(e.querySelector(".hud-why")!);
    const btn = e.getBoundingClientRect();
    const r = e.querySelector(".hud-why")!.getBoundingClientRect();
    return {
      color: c.color,
      border: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`,
      opacity: c.opacity,
      whySize: w.fontSize,
      inside:
        r.top >= btn.top && r.bottom <= btn.bottom && r.left >= btn.left && r.right <= btn.right,
    };
  });
  expect(st.color).toBe("rgb(169, 194, 188)"); // #a9c2bc
  expect(st.border).toBe("2px dashed rgb(143, 169, 163)"); // #8fa9a3
  expect(st.opacity).toBe("1");
  expect(st.whySize).toBe("12px");
  expect(st.inside).toBe(true);

  // ホバーで全文のツールチップ（16px）
  await patch.hover({ force: true });
  const tip = await patch.evaluate((e) => {
    const a = getComputedStyle(e, "::after");
    return { content: a.content, size: a.fontSize };
  });
  expect(tip.content).toBe('"再現できていないバグは直せません"');
  expect(tip.size).toBe("16px");
});

/**
 * #142: 5 スキル（＋修正パッチ）が全部、中段の表示領域とターン終了ボタンの上に収まり、互いに重ならない。
 * 1280×720 / 844×390 / 390×844 のどれでも。ボタンは h>=44。
 */
test("戦闘HUD(#142): スキルが全部見える・ターン終了と重ならない・h>=44", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  const firstBattle = plan.steps.findIndex((s) => s.scene === "battle");
  for (const step of plan.steps.slice(0, firstBattle + 1)) {
    await press(page, step.press);
    await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
    await page.evaluate(() => window.__qa!.waitForIdle());
  }
  for (const vp of [...SIZES, { width: 390, height: 844 }]) {
    await page.setViewportSize(vp);
    const tag = `${vp.width}x${vp.height}`;
    // 「（CPU n）」は1行に収まる（#142 差し戻し: 「（CPU」と「1）」の間で割れない）
    const cpuLines = await page
      .locator(".hud-cpu-tag")
      .evaluateAll((els) => els.map((e) => e.getClientRects().length));
    expect(cpuLines.length, `${tag} CPU tag`).toBeGreaterThan(0);
    for (const n of cpuLines) expect(n, `${tag} CPU tag は1行`).toBe(1);
    const skills = await page
      .locator(".hud-skills .hud-btn")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    const end = (await page
      .getByRole("button", { name: "ターン終了", exact: true })
      .boundingBox())!;
    const foot = await page
      .locator(".hud-battle-foot")
      .evaluate((e) => e.getBoundingClientRect().top);
    expect(skills.length, tag).toBeGreaterThanOrEqual(5);
    for (const r of skills) {
      expect(r.height, `${tag} h`).toBeGreaterThanOrEqual(44);
      expect(r.top, `${tag} top`).toBeGreaterThanOrEqual(0);
      // 下段（ターン終了）の上端より上に全体が収まる = 中段で切れない・ターン終了と重ならない
      expect(r.bottom, `${tag} bottom <= foot`).toBeLessThanOrEqual(foot + 0.5);
      expect(r.bottom, `${tag} bottom <= end`).toBeLessThanOrEqual(end.y);
    }
    for (let i = 0; i < skills.length; i++)
      for (let j = i + 1; j < skills.length; j++) {
        const a = skills[i]!;
        const b = skills[j]!;
        const overlap =
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `${tag} skill ${i}/${j} overlap`).toBe(false);
      }
  }
});

/**
 * #94 Codex P2: 844×390 横は右列が overflow-y:auto なので、1段目の無効ボタンのツールチップを上に出すと枠で切れていた。
 * CPU を使い切って1段目を無効にし、全文（最長16字に差し替え）のツールチップがスクロール枠と画面の中に収まることを見る。
 */
test("戦闘HUD(#94): ツールチップがスクロール枠と画面で切れない", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  const firstBattle = plan.steps.findIndex((s) => s.scene === "battle");
  for (const step of plan.steps.slice(0, firstBattle + 1)) {
    await press(page, step.press);
    await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
    await page.evaluate(() => window.__qa!.waitForIdle());
  }
  for (const name of [/^ホットフィックス/, /^ブレークポイント/]) {
    await page.getByRole("button", { name }).click();
    await page.evaluate(() => window.__qa!.waitForIdle());
  }
  await page.evaluate(() =>
    document
      .querySelectorAll(".hud-btn--why")
      .forEach((e) => e.setAttribute("data-why", "再現できていないバグは直せません")),
  );
  for (const vp of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(vp);
    const btns = page.locator(".hud-skills .hud-btn--why");
    const n = await btns.count();
    expect(n, `${vp.width}x${vp.height} 理由つきボタン`).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < n; i++) {
      const b = btns.nth(i);
      await b.hover({ force: true });
      const r = await b.evaluate((e) => {
        const a = getComputedStyle(e, "::after");
        const c = getComputedStyle(e);
        const btn = e.getBoundingClientRect();
        const w = parseFloat(a.width) + parseFloat(a.paddingLeft) + parseFloat(a.paddingRight) + 2;
        const h = parseFloat(a.height) + parseFloat(a.paddingTop) + parseFloat(a.paddingBottom) + 2;
        const x0 = btn.left + parseFloat(c.borderLeftWidth);
        const y0 = btn.top + parseFloat(c.borderTopWidth);
        const left = x0 + parseFloat(a.left) - (a.transform === "none" ? 0 : w / 2);
        const top = y0 + parseFloat(a.top);
        // 切り取る祖先: overflow が visible 以外の一番近い祖先（無ければ画面）
        let p = e.parentElement;
        while (p && getComputedStyle(p).overflowY === "visible") p = p.parentElement;
        const clip = p && p !== document.documentElement ? p.getBoundingClientRect() : null;
        return {
          tip: { left, top, right: left + w, bottom: top + h },
          clip: {
            left: Math.max(clip?.left ?? 0, 0),
            top: Math.max(clip?.top ?? 0, 0),
            right: Math.min(clip?.right ?? innerWidth, innerWidth),
            bottom: Math.min(clip?.bottom ?? innerHeight, innerHeight),
          },
        };
      });
      const tag = `${vp.width}x${vp.height} #${i}`;
      expect(r.tip.left, tag).toBeGreaterThanOrEqual(r.clip.left - 0.5);
      expect(r.tip.top, tag).toBeGreaterThanOrEqual(r.clip.top - 0.5);
      expect(r.tip.right, tag).toBeLessThanOrEqual(r.clip.right + 0.5);
      expect(r.tip.bottom, tag).toBeLessThanOrEqual(r.clip.bottom + 0.5);
    }
  }
});

/**
 * #166 sota レビュー: 症状が4つ並んでも、844×390（横持ちスマホ）で4行とも読める。
 * 800×481 は操作列の1行目のボタン（スキル）が、スクロールで届いて実際にクリックできる。
 */
test("戦闘HUD(#166): 844×390で症状4行が見切れず、800×481で操作列1行目をクリックできる", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  const firstFloor2Battle = plan.steps.findIndex((s) => s.floor === 2 && s.scene === "battle");
  for (const step of plan.steps.slice(0, firstFloor2Battle + 1)) {
    await press(page, step.press);
    await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
    await page.evaluate(() => window.__qa!.waitForIdle());
  }
  // 症状欄を4行にする（見た目の検査だけなので DOM を差し替える）
  await page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="症状"]')!;
    sec.querySelector("p")?.remove();
    let ul = sec.querySelector("ul");
    if (!ul) {
      ul = document.createElement("ul");
      ul.className = "hud-list";
      sec.appendChild(ul);
    }
    ul.replaceChildren(
      ...["何かがおかしい", "表示と1ずれる", "ループが1回多い", "メモリが増え続ける"].map((t) => {
        const li = document.createElement("li");
        li.className = "hud-hint";
        li.textContent = t;
        return li;
      }),
    );
  });

  // 844×390: 4行すべてが症状欄（.hud-cols）と画面の中に収まり、スクロールしなくても読める
  await page.setViewportSize({ width: 844, height: 390 });
  const fit = await page.evaluate(() => {
    const cols = document.querySelector(".hud-battle-body .hud-cols")!.getBoundingClientRect();
    return [...document.querySelectorAll('section[aria-label="症状"] li')].map((li) => {
      const r = li.getBoundingClientRect();
      return {
        text: li.textContent,
        insideCols: r.top >= cols.top - 0.5 && r.bottom <= cols.bottom + 0.5,
        insideViewport: r.bottom <= window.innerHeight,
      };
    });
  });
  expect(fit).toHaveLength(4);
  for (const f of fit) {
    expect(f.insideCols, `844x390 症状「${f.text}」が症状欄に収まる`).toBe(true);
    expect(f.insideViewport, `844x390 症状「${f.text}」が画面内`).toBe(true);
  }

  // 800×481: 操作列1行目の先頭ボタンが、スクロールで届いて他の要素に隠れずクリックできる
  await page.setViewportSize({ width: 800, height: 481 });
  const first = page.locator(".hud-battle-actions .hud-skills button").first();
  await first.scrollIntoViewIfNeeded();
  const topmost = await first.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === b || b.contains(hit);
  });
  expect(topmost, "800x481 操作列1行目のボタンが他の要素に隠れていない").toBe(true);
  await first.click({ timeout: 3_000 });
});

/**
 * #160: スマホ縦 390×844 の戦闘で、候補バグ名（「? 無限ループ」等）が縦に割れず1行で読める。
 * 各候補の文字の高さが1行分（行の高さ×1.5 未満）で、横にあふれず viewport 内に収まっていること。
 */
test("戦闘HUD(#160): 縦持ち390×844で候補名が1行・viewport内に収まる", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await expect(page.locator("body")).toHaveAttribute("data-scene", "title", { timeout: 15_000 });
  await page.getByRole("button", { name: "新しいラン" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "map");
  const firstBattle = plan.steps.findIndex((s) => s.scene === "battle");
  for (const step of plan.steps.slice(0, firstBattle + 1)) {
    await press(page, step.press);
    await expect(page.locator("body")).toHaveAttribute("data-scene", step.scene);
    await page.evaluate(() => window.__qa!.waitForIdle());
  }
  const items = page.locator(".hud-cands li");
  const n = await items.count();
  expect(n).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < n; i++) {
    const li = items.nth(i);
    const m = await li.evaluate((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      const t = r.getBoundingClientRect();
      const lh =
        parseFloat(getComputedStyle(e).lineHeight) ||
        parseFloat(getComputedStyle(e).fontSize) * 1.4;
      const b = e.getBoundingClientRect();
      return {
        textH: t.height,
        lh,
        right: b.right,
        left: b.left,
        scrollW: e.scrollWidth,
        clientW: e.clientWidth,
      };
    });
    const label = `候補${i} ${await li.textContent()}`;
    expect(m.textH, `${label} は1行`).toBeLessThan(m.lh * 1.5);
    expect(m.right, `${label} 右端が viewport 内`).toBeLessThanOrEqual(390);
    expect(m.left).toBeGreaterThanOrEqual(0);
    expect(m.scrollW, `${label} 文字が枠からあふれない`).toBeLessThanOrEqual(m.clientW + 1);
  }
});
