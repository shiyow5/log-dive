import { describe, expect, it } from "vitest";
import floorsJson from "../../src/data/floors.json";
import { BUG_IDS, DataError } from "../../src/core/data";
import {
  START_ROOM,
  candidatesForFloor,
  distancesFrom,
  farthestRoom,
  floorCount,
  generateFloor,
  loadFloors,
  parseFloors,
} from "../../src/core/floor";
import type { FloorState } from "../../src/core/run";

const SEEDS = Array.from({ length: 1000 }, (_, i) => `seed-${i}`);

function bugsIn(floor: FloorState): { bugs: number; boss: number } {
  let bugs = 0;
  let boss = 0;
  for (const r of floor.rooms) {
    if (r.content.kind !== "bug") continue;
    if (r.content.boss) boss += r.content.bugs.length;
    else bugs += r.content.bugs.length;
  }
  return { bugs, boss };
}

function count(floor: FloorState, kind: string): number {
  return floor.rooms.filter((r) => r.content.kind === kind).length;
}

describe("floors.json", () => {
  it("3階で、部屋数・バグ数・宝箱は spec-a §5 の表どおり", () => {
    const f = loadFloors();
    expect(floorCount(f)).toBe(3);
    expect(f.floors.map((d) => [d.rooms, d.bugs, d.chest, d.boss])).toEqual([
      [6, 2, "breakpoint", false],
      [7, 3, "bisect", false],
      [8, 2, null, true],
    ]);
  });

  it("候補は1階が2種、2階以降は全5種（v0.2 決定3）", () => {
    expect(candidatesForFloor(1)).toEqual(["off-by-one", "null-ref"]);
    expect([...candidatesForFloor(2)].sort()).toEqual([...BUG_IDS].sort());
    expect([...candidatesForFloor(3)].sort()).toEqual([...BUG_IDS].sort());
  });

  it("壊れた値はファイル名と項目名つきの DataError", () => {
    const bad = structuredClone(floorsJson) as { floors: { bugs: number }[] };
    (bad.floors[0] as { bugs: number }).bugs = 99;
    expect(() => parseFloors(bad)).toThrow(DataError);
    expect(() => parseFloors(bad)).toThrow(/floors\.json: floors\[0\]\.bugs/);

    const noBoss = structuredClone(floorsJson) as { floors: { boss: boolean }[] };
    (noBoss.floors[2] as { boss: boolean }).boss = false;
    expect(() => parseFloors(noBoss)).toThrow(/floors\.json: floors/);

    const dup = structuredClone(floorsJson) as { labels: string[] };
    dup.labels.push(dup.labels[0] as string);
    expect(() => parseFloors(dup)).toThrow(/floors\.json: labels/);
  });
});

describe("generateFloor: 決定性", () => {
  it("同じシード・階・増援なら同じ階、シードが違えば（ほぼ）違う階", () => {
    expect(generateFloor("abc", 2)).toEqual(generateFloor("abc", 2));
    expect(generateFloor("abc", 2, { reinforcements: 1 })).toEqual(
      generateFloor("abc", 2, { reinforcements: 1 }),
    );
    const shapes = new Set(SEEDS.slice(0, 50).map((s) => JSON.stringify(generateFloor(s, 2))));
    expect(shapes.size).toBeGreaterThan(40);
  });
});

describe("generateFloor: 1000 シードで全階が成り立つ（spec-a §5・v0.2 §9）", () => {
  for (const n of [1, 2, 3]) {
    it(`${n}階`, () => {
      const def = loadFloors().floors[n - 1]!;
      for (const seed of SEEDS) {
        const floor = generateFloor(seed, n);
        const ctx = `seed=${seed} floor=${n}`;
        expect(floor.number, ctx).toBe(n);
        expect(floor.rooms.length, ctx).toBe(def.rooms);

        // 開始部屋から全部屋に届く・通路は双方向・同じマスに2部屋無い
        const dist = distancesFrom(floor);
        expect(dist.size, ctx).toBe(def.rooms);
        const byId = new Map(floor.rooms.map((r) => [r.id, r]));
        const cells = new Set<string>();
        for (const r of floor.rooms) {
          cells.add(`${r.x},${r.y}`);
          for (const nb of r.neighbors) expect(byId.get(nb)?.neighbors, ctx).toContain(r.id);
          // 通路は隣のマスだけ（ミニマップに線を引ける）
          for (const nb of r.neighbors) {
            const o = byId.get(nb)!;
            expect(Math.abs(o.x - r.x) + Math.abs(o.y - r.y), ctx).toBe(1);
          }
        }
        expect(cells.size, ctx).toBe(def.rooms);
        expect(Math.min(...floor.rooms.map((r) => r.x)), ctx).toBe(0);
        expect(Math.min(...floor.rooms.map((r) => r.y)), ctx).toBe(0);

        // 開始部屋は空で訪問済み、他は未訪問
        const start = byId.get(START_ROOM)!;
        expect(start.content, ctx).toEqual({ kind: "empty" });
        expect(
          floor.rooms.filter((r) => r.visited).map((r) => r.id),
          ctx,
        ).toEqual([START_ROOM]);

        // 最遠部屋: 1・2階は階段、3階はボスで階段なし
        const far = byId.get(farthestRoom(floor))!;
        if (def.boss) {
          expect(far.content, ctx).toMatchObject({ kind: "bug", boss: true });
          expect(count(floor, "stairs"), ctx).toBe(0);
        } else {
          expect(far.content, ctx).toEqual({ kind: "stairs" });
          expect(count(floor, "stairs"), ctx).toBe(1);
        }

        // 宝箱・バグの数と種類
        expect(count(floor, "chest"), ctx).toBe(def.chest === null ? 0 : 1);
        if (def.chest !== null) {
          expect(floor.rooms.find((r) => r.content.kind === "chest")?.content, ctx).toEqual({
            kind: "chest",
            skill: def.chest,
          });
        }
        expect(bugsIn(floor), ctx).toEqual({ bugs: def.bugs, boss: def.boss ? 1 : 0 });
        for (const r of floor.rooms) {
          if (r.content.kind === "bug") {
            for (const b of r.content.bugs) expect(def.pool, ctx).toContain(b);
          }
        }

        // ラベルは階の中で重ならない
        expect(new Set(floor.rooms.map((r) => r.label)).size, ctx).toBe(def.rooms);
      }
    });
  }
});

describe("generateFloor: 最遠部屋", () => {
  it("同点は id の若い順（v0.2 決定9）", () => {
    // r1 ─ r0 ─ r2 : r1 と r2 はどちらも手数1
    const floor: FloorState = {
      number: 1,
      boss: false,
      rooms: [
        {
          id: "r0",
          label: "a",
          x: 1,
          y: 0,
          neighbors: ["r1", "r2"],
          visited: true,
          content: { kind: "empty" },
        },
        {
          id: "r1",
          label: "b",
          x: 0,
          y: 0,
          neighbors: ["r0"],
          visited: false,
          content: { kind: "empty" },
        },
        {
          id: "r2",
          label: "c",
          x: 2,
          y: 0,
          neighbors: ["r0"],
          visited: false,
          content: { kind: "empty" },
        },
      ],
    };
    expect(farthestRoom(floor)).toBe("r1");
  });

  it("id の比較は数として行う（r10 より r2 が若い）", () => {
    const rooms = Array.from({ length: 11 }, (_, i) => ({
      id: `r${i}`,
      label: `l${i}`,
      x: i,
      y: 0,
      neighbors: i === 0 ? Array.from({ length: 10 }, (_, j) => `r${j + 1}`) : ["r0"],
      visited: i === 0,
      content: { kind: "empty" as const },
    }));
    expect(farthestRoom({ number: 1, boss: false, rooms })).toBe("r1");
  });
});

describe("generateFloor: デグレ増援（v0.2 決定2）", () => {
  it("空き部屋があれば空き部屋に1体ずつ入る", () => {
    for (const seed of SEEDS.slice(0, 200)) {
      // 2階は 7部屋 = 開始・階段・宝箱・バグ3 → 空き1
      const floor = generateFloor(seed, 2, { reinforcements: 1 });
      expect(bugsIn(floor).bugs).toBe(4);
      expect(count(floor, "empty")).toBe(1); // 開始部屋だけ
      for (const r of floor.rooms) {
        if (r.content.kind === "bug") expect(r.content.bugs.length).toBe(1);
      }
    }
  });

  it("空きが無ければバグのいる部屋に複数体（ボス部屋には足さない）", () => {
    for (const seed of SEEDS.slice(0, 200)) {
      for (const n of [1, 2, 3]) {
        const def = loadFloors().floors[n - 1]!;
        const floor = generateFloor(seed, n, { reinforcements: 2 });
        expect(bugsIn(floor), `seed=${seed} floor=${n}`).toEqual({
          bugs: def.bugs + 2,
          boss: def.boss ? 1 : 0,
        });
        const boss = floor.rooms.find((r) => r.content.kind === "bug" && r.content.boss);
        if (boss?.content.kind === "bug") expect(boss.content.bugs.length).toBe(1);
        expect(distancesFrom(floor).size).toBe(def.rooms);
      }
    }
  });

  it("増援が負や小数なら RangeError", () => {
    expect(() => generateFloor("x", 1, { reinforcements: -1 })).toThrow(RangeError);
    expect(() => generateFloor("x", 1, { reinforcements: 0.5 })).toThrow(RangeError);
    expect(() => generateFloor("x", 4)).toThrow(RangeError);
  });
});
