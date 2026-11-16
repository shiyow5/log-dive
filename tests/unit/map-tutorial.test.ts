import { describe, expect, it } from "vitest";
import { MemoryStorage, SaveStore } from "../../src/core/save";
import { initRun, type RoomState, type RunEvent, type RunState } from "../../src/core/run";
import {
  MapTutorial,
  STUCK_ROOMS,
  TUTORIAL_KEY,
  shouldShowTutorial,
} from "../../src/ui/map-tutorial";

const room = (id: string, neighbors: string[], content: RoomState["content"]): RoomState => ({
  id,
  label: `${id}()`,
  x: 0,
  y: 0,
  neighbors,
  visited: id === "r0",
  content,
});

/** r0 ─ r1(バグ) ─ r2(宝箱) ─ r3(階段) の一本道。 */
const chain = (): RoomState[] => [
  room("r0", ["r1"], { kind: "empty" }),
  room("r1", ["r0", "r2"], { kind: "bug", bugs: ["off-by-one"] }),
  room("r2", ["r1", "r3"], { kind: "chest", skill: "bisect" }),
  room("r3", ["r2"], { kind: "stairs" }),
];

/** 宝箱のない一本道 r0 ─ r1 ─ r2 ─ r3 ─ r4（すべて空）。 */
const noChest = (): RoomState[] =>
  [0, 1, 2, 3, 4].map((i) =>
    room(`r${i}`, [i > 0 ? `r${i - 1}` : "", i < 4 ? `r${i + 1}` : ""].filter(Boolean), {
      kind: "empty",
    }),
  );

function st(
  rooms: RoomState[],
  roomId: string,
  events: RunEvent[] = [],
  over: Partial<RunState> = {},
): RunState {
  const base = initRun("t");
  return { ...base, floor: { number: 1, rooms }, roomId, events, ...over };
}

const moved = (id: string): RunEvent => ({ t: "moved", room: id });
const flag = (storage: MemoryStorage) => storage.getItem(TUTORIAL_KEY);

function begin(storage = new MemoryStorage(), qa = false) {
  const t = new MapTutorial(storage, qa);
  t.start(st(chain(), "r0"));
  return { t, storage };
}

describe("MapTutorial", () => {
  it("遷移 1→2→3→4→完了。強調対象も各ステップで切り替わる", () => {
    const { t, storage } = begin();
    expect(t.view(st(chain(), "r0"))).toMatchObject({
      step: 1,
      total: 4,
      target: { kind: "move", rooms: ["r1"] },
    });
    // 1: 移動 → 2
    t.observe(st(chain(), "r0", [moved("r1")]));
    expect(t.currentStep).toBe(2);
    // 2: 戦闘に入る → 一時停止して 3 へ
    t.observe(
      st(chain(), "r1", [moved("r1"), { t: "battleStart", room: "r1" }], { phase: "battle" }),
    );
    expect(t.isPaused).toBe(true);
    expect(t.currentStep).toBe(3);
    // 戻ったら再開。宝箱のない部屋では強調なし
    const back = st(chain(), "r1");
    t.observe(back);
    expect(t.isPaused).toBe(false);
    expect(t.view(back)).toMatchObject({ step: 3, target: { kind: "none" } });
    // 宝箱の部屋では宝箱ボタンを強調
    t.observe(st(chain(), "r2", [moved("r2")]));
    expect(t.view(st(chain(), "r2"))).toMatchObject({ step: 3, target: { kind: "chest" } });
    // 3: 開ける → 4（バグが残っていなければ階段が開いている → 次の一歩を強調）
    const cleared = chain().map((r) =>
      r.id === "r1" ? { ...r, content: { kind: "empty" as const } } : r,
    );
    t.observe(st(cleared, "r2", [{ t: "looted", skill: "bisect" }]));
    expect(t.currentStep).toBe(4);
    expect(t.view(st(cleared, "r2"))).toMatchObject({
      step: 4,
      target: { kind: "move", rooms: ["r3"] },
    });
    expect(flag(storage)).toBeNull();
    // 4: 階段を降りる → 完了して保存
    t.observe(st(cleared, "r3", [moved("r3"), { t: "descended", floor: 2 }]));
    expect(t.active).toBe(false);
    expect(flag(storage)).not.toBeNull();
  });

  it("ステップ4: 階段が閉じている間は強調なしで「階段が開く」案内", () => {
    const { t } = begin();
    t.observe(st(chain(), "r2", [{ t: "looted", skill: "bisect" }]));
    const v = t.view(st(chain(), "r2"));
    expect(v).toMatchObject({ step: 4, target: { kind: "none" } });
    expect(v?.text).toContain("階段が開く");
  });

  it("ステップ3: 宝箱の部屋が出ないまま3部屋動いたら完了扱いでステップ4へ", () => {
    const { t } = begin();
    t.start(st(noChest(), "r0"));
    t.observe(st(noChest(), "r1", [moved("r1")])); // 1→2
    t.observe(
      st(noChest(), "r1", [moved("r1"), { t: "battleStart", room: "r1" }], { phase: "battle" }),
    ); // →3
    t.observe(st(noChest(), "r1"));
    for (let i = 1; i < STUCK_ROOMS; i++) {
      t.observe(st(noChest(), `r${i + 1}`, [moved(`r${i + 1}`)]));
      expect(t.currentStep).toBe(3);
    }
    t.observe(st(noChest(), "r4", [moved("r4")]));
    expect(t.currentStep).toBe(4);
  });

  it("ステップ3: 宝箱の部屋に着いたあとは3部屋を超えても詰め込まれない（開けるまで待つ）", () => {
    const { t } = begin();
    t.observe(st(chain(), "r0", [moved("r1")]));
    t.observe(st(chain(), "r1", [], { phase: "battle" }));
    t.observe(st(chain(), "r2", [moved("r2")])); // 宝箱の部屋
    for (let i = 0; i < 5; i++) t.observe(st(chain(), i % 2 ? "r2" : "r1", [moved("r1")]));
    expect(t.currentStep).toBe(3);
  });

  it("戦闘中は view が null（一時停止）で、マップに戻ると同じステップから再開する", () => {
    const { t } = begin();
    t.observe(st(chain(), "r0", [moved("r1")]));
    const battle = st(chain(), "r1", [], { phase: "battle" });
    t.observe(battle);
    expect(t.view(battle)).toBeNull();
    expect(t.active).toBe(true);
    t.observe(st(chain(), "r1"));
    expect(t.view(st(chain(), "r1"))?.step).toBe(3);
  });

  it("ステップ1で直接バグ部屋に入っても詰まらない（戦闘で一時停止し、戻ったらステップ3）", () => {
    const { t } = begin();
    t.observe(st(chain(), "r1", [moved("r1")], { phase: "battle" }));
    t.observe(st(chain(), "r1"));
    expect(t.currentStep).toBe(3);
  });

  it("ステップ2: 訪問済みの空き部屋（戻るだけ）は強調せず、未踏の部屋を強調する（kyoya P2）", () => {
    const rooms = [
      room("r0", ["r1", "r2"], { kind: "empty" }),
      room("r1", ["r0"], { kind: "empty" }),
      room("r2", ["r0"], { kind: "bug", bugs: ["off-by-one"] }),
    ].map((r) => (r.id === "r1" ? { ...r, visited: true } : r));
    const t = new MapTutorial(new MemoryStorage(), false);
    t.start(st(rooms, "r0"));
    t.observe(st(rooms, "r0", [moved("r1")]));
    expect(t.currentStep).toBe(2);
    expect(t.view(st(rooms, "r0"))).toMatchObject({
      step: 2,
      target: { kind: "move", rooms: ["r2"] },
    });
  });

  it("ステップ3を宝箱に会えず飛ばしたら、ステップ4の文言でスキルに触れる（kyoya P3）", () => {
    const { t } = begin();
    t.start(st(noChest(), "r0"));
    t.observe(st(noChest(), "r1", [moved("r1")]));
    t.observe(
      st(noChest(), "r1", [moved("r1"), { t: "battleStart", room: "r1" }], { phase: "battle" }),
    );
    t.observe(st(noChest(), "r1"));
    for (const id of ["r2", "r3", "r4"]) t.observe(st(noChest(), id, [moved(id)]));
    expect(t.currentStep).toBe(4);
    const stairs = noChest().map((r) =>
      r.id === "r4" ? { ...r, content: { kind: "stairs" as const } } : r,
    );
    expect(t.view(st(stairs, "r3"))?.text).toContain("スキル");
  });

  it("スキップで終了して保存し、以後 view は null", () => {
    const { t, storage } = begin();
    t.skip();
    expect(t.active).toBe(false);
    expect(t.view(st(chain(), "r0"))).toBeNull();
    expect(flag(storage)).not.toBeNull();
  });

  it("2回目（完了/スキップ保存済み）は出さない", () => {
    const { t, storage } = begin();
    t.skip();
    const again = new MapTutorial(storage, false);
    again.start(st(chain(), "r0"));
    expect(again.active).toBe(false);
    expect(again.view(st(chain(), "r0"))).toBeNull();
  });

  it("?seed= のときは出さず、フラグも書かない（スキップ・完了しても）", () => {
    const { t, storage } = begin(new MemoryStorage(), true);
    expect(t.active).toBe(false);
    expect(t.view(st(chain(), "r0"))).toBeNull();
    t.observe(st(chain(), "r1", [moved("r1")]));
    t.skip();
    expect(flag(storage)).toBeNull();
  });

  it("途中でランが終わったら保存せず終わる（次のランでまた出る）", () => {
    const { t, storage } = begin();
    t.observe(st(chain(), "r0", [{ t: "runEnd", phase: "abandoned" }], { phase: "abandoned" }));
    expect(t.active).toBe(false);
    expect(flag(storage)).toBeNull();
    t.start(st(chain(), "r0"));
    expect(t.active).toBe(true);
  });

  it("リトライ（新しいランの start）では、途中・敗北で終わった案内もステップ1から始まる", () => {
    const { t } = begin();
    t.observe(st(chain(), "r1", [moved("r1")]));
    t.observe(st(chain(), "r1", [], { phase: "battle" }));
    expect(t.currentStep).toBe(3);
    t.observe(st(chain(), "r1", [], { phase: "lost" }));
    expect(t.active).toBe(false);
    t.start(st(chain(), "r0"));
    expect(t.active).toBe(true);
    expect(t.currentStep).toBe(1);
    expect(t.isPaused).toBe(false);
  });

  it("1階以外・戦闘中の開始では始めない", () => {
    const t = new MapTutorial(new MemoryStorage(), false);
    t.start({ ...st(chain(), "r0"), floor: { number: 2, rooms: chain() } });
    expect(t.active).toBe(false);
  });
});

describe("保存フラグ tutorial.map", () => {
  it("未保存なら出す", () => {
    expect(shouldShowTutorial(new MemoryStorage())).toBe(true);
  });

  it("破損・未知の値・別バージョンは出さない側に倒す", () => {
    for (const raw of [
      "{not json",
      "1",
      "null",
      '{"v":1}',
      '{"v":1,"sum":"x","data":"done"}',
      "done",
    ]) {
      const s = new MemoryStorage();
      s.setItem(TUTORIAL_KEY, raw);
      expect(shouldShowTutorial(s), raw).toBe(false);
    }
    const s = new MemoryStorage();
    new SaveStore<string>(s, TUTORIAL_KEY, 99).save("done");
    expect(shouldShowTutorial(s)).toBe(false);
  });

  it("未知の値でも正しく保存されていれば出さない", () => {
    const s = new MemoryStorage();
    new SaveStore<string>(s, TUTORIAL_KEY, 1).save("???");
    expect(shouldShowTutorial(s)).toBe(false);
  });

  it("storage が例外を投げても出さない", () => {
    const bad = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(shouldShowTutorial(bad)).toBe(false);
  });
});
