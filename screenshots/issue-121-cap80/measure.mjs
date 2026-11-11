// usage: node measure.mjs <baseURL> <outdir> <tag>   (repo: /root/work/ld121b-kirara)
import { chromium } from "/root/work/ld121b-kirara/node_modules/playwright/index.mjs";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const [base, out, tag] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const plan = JSON.parse(readFileSync("/root/work/ld121c-kirara/e2e/fixtures/full-run-plan.json", "utf8"));
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SIZES = [[390,844],[844,390],[1280,720]];
const browser = await chromium.launch();
async function press(page, p) {
  if (p.kind === "move") await page.getByRole("navigation",{name:"隣の部屋"}).getByRole("button",{name:new RegExp(`^${esc(p.name)}`)}).click();
  else for (const n of p.names) await page.getByRole("button",{name:n,exact:true}).click();
}
const lastMap3 = (() => { let k=-1; plan.steps.forEach((s,i)=>{ if(s.floor===3 && s.scene==="map") k=i; }); return k; })();
const res = {};
async function measure(page, key, label) {
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const ms = await import("/src/scenes/map-symbols.ts");
    const rp = await import("/src/scenes/run-port.ts");
    const s = rp.current();
    const c = document.querySelector("canvas").getBoundingClientRect();
    const portrait = innerHeight >= innerWidth;
    const k = c.width / 320;
    const H = document.querySelector("canvas").height / 4; // 内部px(320基準)。RENDER_SCALE=4
    const l = ms.calcMapLayout(s.floor.rooms, portrait ? { availH: H } : undefined);
    window.__roomInfo = { floorRooms: s.floor.rooms.length, gridW: Math.max(...s.floor.rooms.map(r=>r.x))+1, gridH: Math.max(...s.floor.rooms.map(r=>r.y))+1, CELL: l.CELL, ROOM_internal: l.ROOM, ROOM_screenPx: +(l.ROOM*k).toFixed(2), CELL_screenPx: +(l.CELL*k).toFixed(2) };
  });
  const m = await page.evaluate(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return { x:+b.left.toFixed(1), y:+b.top.toFixed(1), w:+b.width.toFixed(2), h:+b.height.toFixed(2), bottom:+b.bottom.toFixed(1) }; };
    const c = document.querySelector("canvas");
    const cr = c.getBoundingClientRect();
    const hud = document.getElementById("hud");
    const panels = [...hud.querySelectorAll(".hud-panel")].map(r);
    const sc = window.__game.scene.getScene("map");
    const k = cr.width / 320; // 画面px / 内部px(320基準)
    const texts = sc.children.list.filter(o => o.type === "Text" && o.text && o.text.length > 1).map(t => ({ text: t.text, fontPx: parseFloat(t.style.fontSize), screenFontPx: +(parseFloat(t.style.fontSize)*k).toFixed(2) }));
    const rs = window.__roomInfo || null;
    return { roomInfo: rs, viewport:{w:innerWidth,h:innerHeight}, canvas:{cssW:cr.width, cssH:cr.height, top:cr.top, bottom:cr.bottom, internalW:c.width, internalH:c.height}, scale:+k.toFixed(4), panels, hudScroll:{scrollH:hud.scrollHeight, clientH:hud.clientHeight}, labels: texts };
  });
  res[key+"-"+label] = m;
}
for (const [w,h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${base}/?fx=0&qa=1&seed=${encodeURIComponent(plan.seed)}`);
  await page.waitForFunction(() => document.body.dataset.scene === "title");
  await page.getByRole("button",{name:"新しいラン"}).click();
  await page.waitForFunction(() => document.body.dataset.scene === "map");
  await page.evaluate(() => window.__qa.waitForIdle());
  const key = `${w}x${h}`;
  await measure(page, key, "floor1-start");
  await page.screenshot({ path: `${out}/map-${key}-floor1-${tag}.png` });
  for (const [i, step] of plan.steps.entries()) {
    await press(page, step.press);
    await page.waitForFunction((s) => document.body.dataset.scene === s, step.scene);
    await page.evaluate(() => window.__qa.waitForIdle());
    if (i === lastMap3) break;
  }
  await measure(page, key, "floor3-late");
  await page.screenshot({ path: `${out}/map-${key}-floor3-${tag}.png` });
  await page.evaluate(async () => { const rp = await import("/src/scenes/run-port.ts"); rp.current().floor.rooms.forEach(r => { r.visited = true; }); window.__game.scene.getScene("map").redrawMap(); });
  await measure(page, key, "floor3-allvisited");
  await page.screenshot({ path: `${out}/map-${key}-floor3-allvisited-${tag}.png` });
  await ctx.close();
}
writeFileSync(`${out}/measure-${tag}.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1).slice(0, 6000));
await browser.close();
