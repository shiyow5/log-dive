import { describe, expect, it } from "vitest";
import { roomSymbol, symbolColor, stairsOpen } from "../../src/scenes/map-symbols";
import { generateFloor } from "../../src/core/floor";
import type { RoomState, RunState } from "../../src/core/run";

function room(
  id: string,
  label: string,
  x: number,
  y: number,
  content: RunState["floor"]["rooms"][number]["content"],
  visited = false,
): RoomState {
  return {
    id,
    label,
    x,
    y,
    neighbors: [],
    visited,
    content,
  };
}

function baseRun(): Partial<RunState> {
  return {
    version: 4,
    seed: "test",
    phase: "map",
    roomId: "r0",
    player: { hp: 10, maxHp: 10, cpu: 5, cpuMax: 5, skills: [] },
    battle: null,
    floorRng: { a: 1, b: 2, c: 3, d: 4 },
    battleCount: 0,
    reinforcements: 0,
    stats: { bugsClosed: 0, turns: 0, degrades: 0 },
    lastError: null,
    events: [],
  };
}

function run(rooms: RoomState[]): RunState {
  return {
    ...baseRun(),
    floor: { number: 1, rooms },
  } as RunState;
}

describe("roomSymbol: 部屋の種類に応じた記号を返す", () => {
  it("未踏の部屋は null", () => {
    const r = room("r0", "test", 0, 0, { kind: "empty" }, false);
    const s = run([r]);
    expect(roomSymbol(r, s)).toBeNull();
  });

  it("階段（閉じている）→ ◆", () => {
    const r = room("r0", "stairs", 0, 0, { kind: "stairs" }, true);
    // バグが残っているので階段は閉じている
    const s = run([r, room("r1", "bug", 1, 0, { kind: "bug", bugs: ["off-by-one"] }, false)]);
    expect(roomSymbol(r, s)).toBe("◆");
  });

  it("階段（開いている）→ ▼", () => {
    const r = room("r0", "stairs", 0, 0, { kind: "stairs" }, true);
    // バグがないので階段が開いている
    const s = run([r]);
    expect(roomSymbol(r, s)).toBe("▼");
  });

  it("宝箱 → ♦", () => {
    const r = room("r0", "chest", 0, 0, { kind: "chest", skill: "patch" }, true);
    const s = run([r]);
    expect(roomSymbol(r, s)).toBe("♦");
  });

  it("ボス（バグあり）→ ▲", () => {
    const r = room("r0", "boss", 0, 0, { kind: "bug", bugs: ["null-ref"], boss: true }, true);
    const s = run([r]);
    expect(roomSymbol(r, s)).toBe("▲");
  });

  it("ボス（バグなし＝クリア済み）→ ★", () => {
    const r = room("r0", "boss", 0, 0, { kind: "bug", bugs: [], boss: true }, true);
    const s = run([r]);
    expect(roomSymbol(r, s)).toBe("★");
  });

  it("通常バグ（あり）→ ×", () => {
    const r = room("r0", "bug", 0, 0, { kind: "bug", bugs: ["off-by-one"] }, true);
    const s = run([r]);
    expect(roomSymbol(r, s)).toBe("×");
  });

  it("通常バグ（なし＝クリア済み）→ ✓", () => {
    const r = room("r0", "bug", 0, 0, { kind: "bug", bugs: [] }, true);
    const s = run([r]);
    expect(roomSymbol(r, s)).toBe("✓");
  });

  it("空部屋 → null", () => {
    const r = room("r0", "empty", 0, 0, { kind: "empty" }, true);
    const s = run([r]);
    expect(roomSymbol(r, s)).toBeNull();
  });
});

describe("symbolColor: 部屋の内容に応じた色を返す", () => {
  it("宝箱 → #f0c040", () => {
    const r = room("r0", "chest", 0, 0, { kind: "chest", skill: "patch" });
    expect(symbolColor(r)).toBe("#f0c040");
  });

  it("階段 → #88c0d0", () => {
    const r = room("r0", "stairs", 0, 0, { kind: "stairs" });
    expect(symbolColor(r)).toBe("#88c0d0");
  });

  it("ボス → #b48ead", () => {
    const r = room("r0", "boss", 0, 0, { kind: "bug", bugs: ["null-ref"], boss: true });
    expect(symbolColor(r)).toBe("#b48ead");
  });

  it("通常バグ → #ff6b5e", () => {
    const r = room("r0", "bug", 0, 0, { kind: "bug", bugs: ["off-by-one"] });
    expect(symbolColor(r)).toBe("#ff6b5e");
  });

  it("空部屋 → #e4f1ec", () => {
    const r = room("r0", "empty", 0, 0, { kind: "empty" });
    expect(symbolColor(r)).toBe("#e4f1ec");
  });
});

describe("stairsOpen: 階段が開いているか", () => {
  it("バグが残っていれば false", () => {
    const s = run([room("r0", "bug", 0, 0, { kind: "bug", bugs: ["off-by-one"] }, true)]);
    expect(stairsOpen(s)).toBe(false);
  });

  it("バグが全部閉じていれば true", () => {
    const s = run([room("r0", "empty", 0, 0, { kind: "empty" }, true)]);
    expect(stairsOpen(s)).toBe(true);
  });
});

describe("roomSymbol: 階段の案B（未踏でも開いたら▼）", () => {
  it("階段（閉じている・未踏）→ null", () => {
    const r = room("r1", "stairs", 1, 0, { kind: "stairs" }, false);
    const s = run([room("r0", "bug", 0, 0, { kind: "bug", bugs: ["off-by-one"] }, true), r]);
    expect(roomSymbol(r, s)).toBeNull();
  });

  it("階段（閉じている・既踏）→ ◆", () => {
    const r = room("r1", "stairs", 1, 0, { kind: "stairs" }, true);
    const s = run([room("r0", "bug", 0, 0, { kind: "bug", bugs: ["off-by-one"] }, true), r]);
    expect(roomSymbol(r, s)).toBe("◆");
  });

  it("階段（開いている・未踏）→ ▼（案B）", () => {
    const stairs = room("r1", "stairs", 1, 0, { kind: "stairs" }, false);
    const s = run([room("r0", "empty", 0, 0, { kind: "empty" }, true), stairs]);
    expect(roomSymbol(stairs, s)).toBe("▼");
  });

  it("階段（開いている・既踏）→ ▼", () => {
    const stairs = room("r1", "stairs", 1, 0, { kind: "stairs" }, true);
    const s = run([room("r0", "empty", 0, 0, { kind: "empty" }, true), stairs]);
    expect(roomSymbol(stairs, s)).toBe("▼");
  });
});

describe("stairsOpen + roomSymbol: 4シード全階で階段の位置が分かる", () => {
  const seeds = ["alpha", "beta", "gamma", "delta"] as const;

  for (const seed of seeds) {
    for (let floorNum = 1; floorNum <= 3; floorNum++) {
      it(`${seed} 階${floorNum}: 全バグ撃破後、階段の部屋が▼（未踏でも）`, () => {
        const floor = generateFloor(seed, floorNum);
        const stairRoom = floor.rooms.find((r) => r.content.kind === "stairs");
        if (!stairRoom) return; // 3階はボス階段なし

        // 階段の部屋を未踏のまま、他の部屋を全部既踏（バグもクリア）
        const rooms = floor.rooms.map((r) => {
          if (r.content.kind === "bug") {
            const bugContent = r.content as Extract<
              RunState["floor"]["rooms"][number]["content"],
              { kind: "bug" }
            >;
            return { ...r, visited: true, content: { ...bugContent, bugs: [] } };
          }
          if (r.id !== stairRoom.id) {
            return { ...r, visited: true };
          }
          return r; // 階段は未踏
        });

        const s = run(rooms as RoomState[]);
        expect(stairsOpen(s)).toBe(true);

        // 階段の部屋が未踏でも ▼ が出る
        const sym = roomSymbol(stairRoom, s);
        expect(sym).toBe("▼");
      });
    }
  }
});
