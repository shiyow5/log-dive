import { describe, expect, it } from "vitest";
import {
  DENSE_SYM_W,
  MAP_AREA_H,
  MAP_AREA_TOP,
  MAP_SHAPE_COLORS,
  COLORS,
  MAX_CELL,
  MIN_CELL,
  CHAR_W,
  ID_FONT_PX,
  PORTRAIT_AVAIL_H,
  PORTRAIT_ID_FONT_PX,
  UNKNOWN_H,
  UNKNOWN_W,
  calcMapLayout,
  partCollisions,
  partRects,
  portraitCanvasH,
  roomLabelText,
  symbolFits,
} from "../../src/scenes/map-symbols";
import { floorCount, generateFloor } from "../../src/core/floor";
import type { RoomState } from "../../src/core/run";

function room(id: string, x: number, y: number, visited = false): RoomState {
  return { id, label: "main()", x, y, neighbors: [], visited, content: { kind: "empty" } };
}

const at = (CELL: number, ROOM = Math.floor(CELL / 2)) => ({
  CELL,
  ROOM,
  ORIGIN_X: 20,
  ORIGIN_Y: 20,
});

describe("部屋 ID・未踏「?」の配置（#88）", () => {
  it("内部フォントは 10px 以上（8px 禁止）", () => {
    expect(ID_FONT_PX).toBeGreaterThanOrEqual(10);
  });

  it("未踏「?」は 6×10px で、未踏の箱の中央に収まる（#114）", () => {
    expect([UNKNOWN_W, UNKNOWN_H]).toEqual([6, 10]);
    for (const CELL of [20, 30]) {
      const { box, unknown } = partRects(room("r1", 2, 2), at(CELL), false);
      expect(unknown).not.toBeNull();
      const u = unknown!;
      expect(u.x + u.w / 2).toBe(box.x + box.w / 2);
      expect(u.y + u.h / 2).toBe(box.y + box.h / 2);
      expect(u.w).toBeLessThanOrEqual(box.w);
      expect(u.h).toBeLessThanOrEqual(box.h);
    }
  });

  it("密な階（CELL<20）は「?」を出さない（上の段の ID と干渉するため）", () => {
    expect(partRects(room("r1", 0, 0), at(15), false).unknown).toBeNull();
  });

  it("疎な階は箱の下に ID を置く隙間（CELL-ROOM >= 10）がある", () => {
    for (let i = 0; i < 50; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const layout = calcMapLayout(generateFloor(`seed-${i}`, n).rooms);
        if (layout.CELL >= 20) expect(layout.CELL - layout.ROOM).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("記号（開いた階段の ▼ など）が出る未踏部屋は「?」を重ねない（#114 Codex P2）", () => {
    const { symbol, unknown } = partRects(room("r1", 1, 1), at(30), true);
    expect(symbol).not.toBeNull();
    expect(unknown).toBeNull();
  });

  it("訪問済みの部屋は「?」を持たない", () => {
    expect(partRects(room("r1", 0, 0, true), at(30), false).unknown).toBeNull();
  });

  it("疎な階の探索済みの部屋は関数名ラベルを箱の真下に中央揃えで置く（#114）", () => {
    const layout = at(30);
    const { box, id } = partRects(room("r3", 1, 1, true), layout, false);
    expect(id).not.toBeNull();
    expect(id!.y).toBe(box.y + box.h);
    expect(id!.x + id!.w / 2).toBe(box.x + box.w / 2);
  });

  it("部屋 ID（r0 等）はラベルに出さない。未踏と密な階はラベルなし（#114）", () => {
    const layout = at(30);
    const label = (r: RoomState, l = layout) => roomLabelText(r, l);
    const named = { ...room("r7", 0, 0, true), label: "config.read()" };
    expect(label(named)).toBe("read");
    expect(label({ ...named, visited: false })).toBeNull();
    expect(label(named, at(15))).toBeNull();
    // 長い名前は CELL に収まる文字数で切る
    const long = { ...named, label: "parseConfigLine()" };
    expect(label(long)!.length * CHAR_W).toBeLessThanOrEqual(layout.CELL - 2);
  });
});

/** 画面幅 w の縦持ちで、HUD が hudH（画面px）のときの canvas 内部高さ。 */
const canvasHFor = (w: number, h: number, hudH: number) => portraitCanvasH(w, h, hudH);

describe("縦持ちの canvas 高さ（#121）: 画面高から HUD の実測高さを引いた全部", () => {
  it("390×844 で HUD が 370px なら、canvas は残り 474px いっぱい（空白を残さない）", () => {
    const h = canvasHFor(390, 844, 370);
    expect(h).toBe(Math.floor((474 * 320) / 390));
    const cssH = (h * 390) / 320;
    expect(cssH).toBeLessThanOrEqual(474);
    // 内部 px の切り捨て（最大 1 内部px ≒ 1.22 画面px）以上の空きは出ない
    expect(474 - cssH).toBeLessThan(390 / 320);
  });

  it("HUD が低いほど canvas は高い（固定の比率・上限は使わない）", () => {
    expect(canvasHFor(390, 844, 300)).toBeGreaterThan(canvasHFor(390, 844, 370));
    expect(canvasHFor(320, 2000, 300)).toBeGreaterThan(360);
  });

  it("HUD が画面を埋めるほど高い・不正値は PORTRAIT_AVAIL_H（180）で止める", () => {
    expect(canvasHFor(390, 844, 800)).toBe(PORTRAIT_AVAIL_H);
    expect(canvasHFor(0, 0, 0)).toBe(PORTRAIT_AVAIL_H);
    expect(canvasHFor(390, 200, 100)).toBe(PORTRAIT_AVAIL_H);
  });
});

describe("縦持ちのマップ配置（#121）", () => {
  // 幅 360（小さめの Android）・390（iPhone 14）・430（Pro Max）、高さは 640〜932、HUD は 300〜380px
  const SCREENS: [number, number, number][] = [
    [360, 800, 370],
    [390, 844, 370],
    [390, 844, 322],
    [430, 932, 360],
  ];
  // 小さめの画面（高さ 640）。6 行の階は縦が足りず、箱は 28px 前後まで（32px は 390×844 級の画面で満たす）
  const SMALL: [number, number, number] = [360, 640, 330];
  const allVisited = (seed: string, n: number): RoomState[] =>
    generateFloor(seed, n).rooms.map((r) => ({ ...r, visited: true }));

  it("部屋の四角は画面上で 32px 以上、ラベルは画面上で 12px 以上（全階・全画面）", () => {
    for (const [w, h, hud] of SCREENS) {
      const k = w / 320;
      const H = canvasHFor(w, h, hud);
      for (let i = 0; i < 40; i++) {
        for (let n = 1; n <= floorCount(); n++) {
          const l = calcMapLayout(generateFloor(`seed-${i}`, n).rooms, { availH: H });
          expect(l.ROOM * k, `${w}x${h} seed-${i} f${n}`).toBeGreaterThanOrEqual(32);
        }
      }
      expect(PORTRAIT_ID_FONT_PX * k).toBeGreaterThanOrEqual(12);
    }
    const [w, h, hud] = SMALL;
    for (let i = 0; i < 40; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const l = calcMapLayout(generateFloor(`seed-${i}`, n).rooms, {
          availH: canvasHFor(w, h, hud),
        });
        expect(l.ROOM * (w / 320), `small seed-${i} f${n}`).toBeGreaterThanOrEqual(28);
      }
    }
  });

  it("最上段の部屋は音ボタン（上 52 画面px）の下、最下段のラベルは canvas の内側", () => {
    for (const [w, h, hud] of SCREENS) {
      const k = w / 320;
      const H = canvasHFor(w, h, hud);
      for (let i = 0; i < 40; i++) {
        for (let n = 1; n <= floorCount(); n++) {
          const rooms = allVisited(`seed-${i}`, n);
          const l = calcMapLayout(rooms, { availH: H });
          for (const r of rooms) {
            const { box, id } = partRects(r, l, false);
            expect(box.y * k, `${w}x${h} seed-${i} f${n} ${r.id}`).toBeGreaterThanOrEqual(52);
            expect(id!.y + id!.h).toBeLessThanOrEqual(H);
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.w).toBeLessThanOrEqual(320);
          }
        }
      }
    }
  });

  it("最も密な 3 階（全部屋が探索済み・記号あり）でも部屋とラベルが重ならない", () => {
    for (const [w, h, hud] of [...SCREENS, SMALL]) {
      const H = canvasHFor(w, h, hud);
      for (let i = 0; i < 100; i++) {
        const rooms = allVisited(`seed-${i}`, 3);
        const l = calcMapLayout(rooms, { availH: H });
        expect(
          partCollisions(rooms, l, () => true),
          `${w}x${h} seed-${i}`,
        ).toEqual([]);
      }
    }
  });

  it("現在地の名前は省略しない。ほかの部屋のラベルも 6 文字は収まる", () => {
    const l = calcMapLayout(generateFloor("seed-1", 3).rooms, {
      availH: canvasHFor(390, 844, 370),
    });
    const named = { ...room("r0", 0, 0, true), label: "scheduler.tick()" };
    expect(roomLabelText(named, l, true)).toBe("tick");
    expect(roomLabelText({ ...named, label: "json.decode()" }, l)).toBe("decode");
    expect(roomLabelText({ ...named, label: "main()" }, l, true)).toBe("main");
    // 長い名前でも現在地は切らない
    expect(roomLabelText({ ...named, label: "parseConfigLineLong()" }, l, true)).toBe(
      "parseConfigLineLong",
    );
  });

  it("canvas が高いほどマップは大きくなり（CELL は下がらない）、縦の中央に寄る", () => {
    const rooms = generateFloor("seed-4", 3).rooms;
    const short = calcMapLayout(rooms, { availH: PORTRAIT_AVAIL_H });
    const tall = calcMapLayout(rooms, { availH: canvasHFor(390, 844, 330) });
    expect(tall.CELL).toBeGreaterThanOrEqual(short.CELL);
    expect(tall.ORIGIN_Y).toBeGreaterThanOrEqual(short.ORIGIN_Y);
  });

  it("縦持ちは同じ階で CELL が横持ちより小さくならない（#114）", () => {
    for (let i = 0; i < 50; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms;
        expect(
          calcMapLayout(rooms, { availH: canvasHFor(390, 844, 370) }).CELL,
        ).toBeGreaterThanOrEqual(calcMapLayout(rooms).CELL);
      }
    }
  });
});

describe("横持ちの下端（HUD の上端を避ける）", () => {
  it("mapBottom より下に部屋・ラベルを出さない（seed-4 floor2 は HUD 上端 86px の例）", () => {
    const rooms = generateFloor("seed-4", 2).rooms;
    for (const visited of [true, false]) {
      const shaped = rooms.map((r) => ({ ...r, visited }));
      const bottomLimit = 80; // HUD 上端 86px の手前に余白 6px
      const l = calcMapLayout(shaped, { mapBottom: bottomLimit });
      for (const r of shaped) {
        const { id, box } = partRects(r, l, false);
        const bottom = id ? id.y + id.h : box.y + box.h;
        expect(bottom, `visited=${visited} ${r.id} CELL=${l.CELL}`).toBeLessThanOrEqual(
          bottomLimit,
        );
      }
    }
  });

  it("mapBottom を省略した横持ちは従来どおり y=6〜106 の領域に収まる", () => {
    for (let i = 0; i < 50; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms.map((r) => ({ ...r, visited: true }));
        const l = calcMapLayout(rooms);
        for (const r of rooms) {
          const { id, box } = partRects(r, l, false);
          const bottom = id ? id.y + id.h : box.y + box.h;
          expect(bottom, `seed-${i} floor=${n} ${r.id}`).toBeLessThanOrEqual(
            MAP_AREA_TOP + MAP_AREA_H,
          );
        }
      }
    }
  });
});

describe("partCollisions: 部屋ID・記号・四角の重なり（#66）", () => {
  it("300 seed × 全階（全部屋に記号あり）で ID・記号が隣や下の部屋と重ならない", () => {
    for (let i = 0; i < 300; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms.map((r) => ({ ...r, visited: true }));
        for (const opts of [undefined, { availH: PORTRAIT_AVAIL_H }]) {
          const l = calcMapLayout(rooms, opts);
          expect(
            partCollisions(rooms, l, () => true),
            `seed-${i} floor=${n} CELL=${l.CELL} portrait=${!!opts}`,
          ).toEqual([]);
        }
        const layout = calcMapLayout(rooms);
        // 未踏の「?」が混じる場合（半分だけ訪問）
        const half = rooms.map((r, k) => ({ ...r, visited: k % 2 === 0 }));
        expect(
          partCollisions(half, layout, () => true),
          `seed-${i} floor=${n} half CELL=${layout.CELL}`,
        ).toEqual([]);
      }
    }
  });

  it("DENSE_SYM_W は 7px 送り幅（DotGothic16 の ◆▼♦▲★）より小さくならず、symbolFits と partRects が同じ値を使う", () => {
    expect(DENSE_SYM_W).toBeGreaterThanOrEqual(7 + 1);
    // 密な階（CELL=15, ROOM=9: 隙間6px）は実測幅7pxの記号が入らないので出さない
    const layout = at(15, 9);
    expect(layout.CELL - layout.ROOM).toBeLessThan(DENSE_SYM_W + 1);
    expect(symbolFits(layout)).toBe(false);
  });
});

/** WCAG 相対輝度によるコントラスト比。 */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const c = [1, 3, 5].map((i) => {
      const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("マップのコントラストと拡大（#89, minori 指定値）", () => {
  it("接続線・未踏枠は背景比 3:1 以上、訪問済み枠は 7:1 前後（非文字 3:1 は枠線で満たす）", () => {
    expect(contrast(MAP_SHAPE_COLORS.line, COLORS.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(MAP_SHAPE_COLORS.visitedEdge, COLORS.bg)).toBeGreaterThanOrEqual(7);
    // 塗りだけでは足りない（枠線が必要な理由）。指定値 1.86:1
    expect(contrast(MAP_SHAPE_COLORS.visitedFill, COLORS.bg)).toBeCloseTo(1.86, 1);
  });

  it("全階で CELL は 12〜24、行数 5 以下（6〜8部屋の階のほぼ全て）で CELL>=20", () => {
    for (let i = 0; i < 100; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms;
        const l = calcMapLayout(rooms);
        expect(l.CELL).toBeGreaterThanOrEqual(MIN_CELL);
        expect(l.CELL).toBeLessThanOrEqual(MAX_CELL);
        const rows = Math.max(...rooms.map((r) => r.y)) + 1;
        if (rows <= 5) expect(l.CELL, `seed-${i} floor=${n}`).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("横持ちは部屋の塊がマップ領域内で水平・垂直とも中央寄せ（上偏りなし）", () => {
    for (let i = 0; i < 100; i++) {
      for (let n = 1; n <= floorCount(); n++) {
        const rooms = generateFloor(`seed-${i}`, n).rooms;
        const l = calcMapLayout(rooms);
        const rects = rooms.map((r) => partRects({ ...r, visited: true }, l, false));
        const top = Math.min(...rects.map((p) => p.box.y));
        const bottom = Math.max(...rects.map((p) => (p.id ? p.id.y + p.id.h : p.box.y + p.box.h)));
        const left = Math.min(...rects.map((p) => p.box.x));
        const right = Math.max(...rects.map((p) => p.box.x + p.box.w));
        const msg = `seed-${i} floor=${n}`;
        expect(top, msg).toBeGreaterThanOrEqual(MAP_AREA_TOP);
        // 領域が足りない密な階（CELL=12 で行数が多い）は上端詰めでよい
        if (bottom <= MAP_AREA_TOP + MAP_AREA_H) {
          expect(
            Math.abs(top - MAP_AREA_TOP - (MAP_AREA_TOP + MAP_AREA_H - bottom)),
            msg,
          ).toBeLessThanOrEqual(1);
        }
        expect(Math.abs(left - (320 - right)), msg).toBeLessThanOrEqual(1);
      }
    }
  });
});
