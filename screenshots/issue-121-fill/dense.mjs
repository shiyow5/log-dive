// usage: node dense.mjs <baseURL> <outdir> <tag> : 3階の密なフロア（seed-92=6x3, seed-217=2x7）を全部屋探索済みで表示して実測
import { chromium } from "/root/work/ld121b-kirara/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [base, out, tag] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const res = {};
for (const seed of ["seed-92", "seed-217"]) for (const [w,h] of [[390,844],[844,390]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${base}/?fx=0&qa=1&seed=e2e-7`);
  await page.waitForFunction(() => document.body.dataset.scene === "title");
  await page.getByRole("button",{name:"新しいラン"}).click();
  await page.waitForFunction(() => document.body.dataset.scene === "map");
  const info = await page.evaluate(async (seed) => {
    const fl = await import("/src/core/floor.ts");
    const rp = await import("/src/scenes/run-port.ts");
    const ms = await import("/src/scenes/map-symbols.ts");
    const s = rp.current();
    const rooms = fl.generateFloor(seed, 3).rooms.map(r => ({ ...r, visited: true }));
    s.floor.rooms.splice(0, s.floor.rooms.length, ...rooms);
    s.floor.number = 3;
    s.roomId = rooms[0].id;
    const sc = window.__game.scene.getScene("map");
    sc.renderHud(s); sc.applyView(); sc.clearMapObjects(); sc.drawMap(s);
    await new Promise(r => setTimeout(r, 500));
    const cv = document.querySelector("canvas"); const c = cv.getBoundingClientRect(); const k = c.width/320;
    const portrait = innerHeight >= innerWidth;
    const l = ms.calcMapLayout(rooms, portrait ? { availH: cv.height/4 } : { mapBottom: sc.hudTopInCanvas() - 4 });
    const panels = [...document.querySelectorAll("#hud .hud-panel")].map(p => { const b=p.getBoundingClientRect(); return {top:+b.top.toFixed(1), bottom:+b.bottom.toFixed(1)}; });
    return { grid: `${Math.max(...rooms.map(r=>r.x))+1}x${Math.max(...rooms.map(r=>r.y))+1}`, rooms: rooms.length, canvasCss: {w:c.width,h:+c.height.toFixed(2)}, CELL:l.CELL, ROOM_internal:l.ROOM, ROOM_screenPx:+(l.ROOM*k).toFixed(2), panels, collisions: ms.partCollisions(rooms, l, () => true) };
  }, seed);
  res[`${seed}-${w}x${h}`] = info;
  await page.screenshot({ path: `${out}/map-${w}x${h}-floor3-dense-${seed}-${tag}.png` });
  await ctx.close();
}
writeFileSync(`${out}/dense-${tag}.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
await browser.close();
