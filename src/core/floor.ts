/**
 * 階の構成。
 *
 * - generateFloor: シード付きで階を作る（spec-a v0.2 §9・spec-a §5）。数値は src/data/floors.json。
 * - fixedFloor: テスト用の「固定の小さな階」（r1 に off-by-one）。ゲーム本体は使わない。
 *
 * 乱数は `floor:${seed}:${n}` から作る（v0.2 決定4）。同じシード・階・増援なら必ず同じ階になる。
 */
import floorsJson from "../data/floors.json";
import { BUG_IDS, DataError, SKILL_IDS, type BugId, type SkillId } from "./data";
import { Rng } from "./rng";
import type { FloorState, RoomContent, RoomState } from "./run";

/** 開始部屋の id（generateFloor・fixedFloor 共通）。 */
export const START_ROOM = "r0";

/** run.ts が使っている旧名。 */
export const FIXED_START_ROOM = START_ROOM;

// ---- floors.json ----

export interface FloorDef {
  readonly number: number;
  /** 部屋の数（開始部屋を含む）。 */
  readonly rooms: number;
  /** 通常バグの数（増援・ボスは別）。 */
  readonly bugs: number;
  /** この階に出るバグの種類（= 戦闘の候補）。 */
  readonly pool: readonly BugId[];
  /** 宝箱のスキル。無い階は null。 */
  readonly chest: SkillId | null;
  /** true の階は最遠部屋にボスを置き、階段は置かない。 */
  readonly boss: boolean;
}

export interface FloorsData {
  readonly schemaVersion: 1;
  readonly floors: readonly FloorDef[];
  readonly startLabel: string;
  /** 開始部屋以外の現在地ラベル。シードで割り当てる。 */
  readonly labels: readonly string[];
}

const FILE = "floors.json";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function int(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new DataError(FILE, path, `は ${min}〜${max} の整数にしてください`);
  }
  return v;
}

function oneOf<T extends string>(v: unknown, path: string, ids: readonly T[]): T {
  if (typeof v !== "string" || !(ids as readonly string[]).includes(v)) {
    throw new DataError(FILE, path, `は ${ids.join(" / ")} のどれかにしてください`);
  }
  return v as T;
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new DataError(FILE, path, "は空でない文字列にしてください");
  }
  return v;
}

/** floors.json を検証して型付きにする。不正なら DataError。 */
export function parseFloors(raw: unknown): FloorsData {
  if (!isObj(raw)) throw new DataError(FILE, "(ルート)", "はオブジェクトにしてください");
  if (raw.schemaVersion !== 1) throw new DataError(FILE, "schemaVersion", "は 1 にしてください");
  if (!Array.isArray(raw.floors) || raw.floors.length === 0) {
    throw new DataError(FILE, "floors", "は空でない配列にしてください");
  }
  const floors = raw.floors.map((v: unknown, i): FloorDef => {
    const p = `floors[${i}]`;
    if (!isObj(v)) throw new DataError(FILE, p, "はオブジェクトにしてください");
    const number = int(v.number, `${p}.number`, i + 1, i + 1);
    const rooms = int(v.rooms, `${p}.rooms`, 2, 16);
    const boss = v.boss === true;
    if (v.boss !== true && v.boss !== false) {
      throw new DataError(FILE, `${p}.boss`, "は true / false にしてください");
    }
    const chest = v.chest === null ? null : oneOf(v.chest, `${p}.chest`, SKILL_IDS);
    // 開始部屋・階段かボス・宝箱を除いた部屋に通常バグが1体ずつ入ること
    const fixed = 2 + (chest === null ? 0 : 1);
    const bugs = int(v.bugs, `${p}.bugs`, 0, rooms - fixed);
    if (!Array.isArray(v.pool) || v.pool.length === 0) {
      throw new DataError(FILE, `${p}.pool`, "は空でない配列にしてください");
    }
    const pool = v.pool.map((b: unknown, j) => oneOf(b, `${p}.pool[${j}]`, BUG_IDS));
    if (new Set(pool).size !== pool.length) {
      throw new DataError(FILE, `${p}.pool`, "に同じ種類が2回あります");
    }
    return { number, rooms, bugs, pool, chest, boss };
  });
  if (!floors[floors.length - 1]?.boss || floors.slice(0, -1).some((f) => f.boss)) {
    throw new DataError(FILE, "floors", "は最後の階だけ boss: true にしてください");
  }
  const startLabel = str(raw.startLabel, "startLabel");
  if (!Array.isArray(raw.labels)) throw new DataError(FILE, "labels", "は配列にしてください");
  const labels = raw.labels.map((l: unknown, i) => str(l, `labels[${i}]`));
  if (new Set([startLabel, ...labels]).size !== labels.length + 1) {
    throw new DataError(FILE, "labels", "に同じ名前があります（startLabel を含む）");
  }
  const most = Math.max(...floors.map((f) => f.rooms)) - 1;
  if (labels.length < most) {
    throw new DataError(
      FILE,
      "labels",
      `は ${most} 個以上にしてください（いちばん広い階の部屋数-1）`,
    );
  }
  return { schemaVersion: 1, floors, startLabel, labels };
}

let cached: FloorsData | null = null;

/** 同梱の floors.json を検証して返す（1回だけ検証してキャッシュ）。 */
export function loadFloors(): FloorsData {
  cached ??= parseFloors(floorsJson);
  return cached;
}

/** 階の数（最小版は3）。 */
export function floorCount(floors: FloorsData = loadFloors()): number {
  return floors.floors.length;
}

function floorDef(floors: FloorsData, n: number): FloorDef {
  const def = floors.floors[n - 1];
  if (!def) throw new RangeError(`floor ${n} は floors.json にありません`);
  return def;
}

// ---- 生成 ----

export interface GenerateFloorOptions {
  /** デグレで増えたバグ（v0.2 決定2: 空き部屋へ。空きが無ければ同じ部屋に複数体）。 */
  readonly reinforcements?: number;
  readonly floors?: FloorsData;
  /** ボス階か（ボスバグを配置）。 */
  readonly boss?: boolean;
}

const DIRS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** 部屋 id の番号（r12 → 12）。最遠同点を「id の若い順」で決めるのに使う。 */
function roomIndex(id: string): number {
  return Number(id.slice(1));
}

/** 開始部屋からの手数（到達できない部屋は入らない）。 */
export function distancesFrom(floor: FloorState, start: string = START_ROOM): Map<string, number> {
  const byId = new Map(floor.rooms.map((r) => [r.id, r]));
  const dist = new Map<string, number>([[start, 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i] as string;
    for (const nb of byId.get(id)?.neighbors ?? []) {
      if (!dist.has(nb) && byId.has(nb)) {
        dist.set(nb, (dist.get(id) as number) + 1);
        queue.push(nb);
      }
    }
  }
  return dist;
}

/** 開始部屋から最も遠い部屋。同点は id の若い順（v0.2 決定9）。 */
export function farthestRoom(floor: FloorState, start: string = START_ROOM): string {
  let best = start;
  let bestD = -1;
  for (const [id, d] of distancesFrom(floor, start)) {
    if (d > bestD || (d === bestD && roomIndex(id) < roomIndex(best))) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/**
 * シード付きで n 階を作る。
 *
 * 形: 開始部屋 r0 から、乱数で選んだ既存の部屋の空いた隣のマスに部屋を足していく（木になるので必ず全部屋に届く）。
 * 中身: 最遠部屋 = 階段（最後の階はボス）。残りの部屋をシャッフルして宝箱 → 通常バグ → 空き の順に入れる。
 * 増援は空き部屋に入れ、空きが無くなったらバグのいる部屋に足す（ボス部屋には足さない）。
 */
export function generateFloor(
  seed: string,
  n: number,
  opts: GenerateFloorOptions = {},
): FloorState {
  const floors = opts.floors ?? loadFloors();
  const def = floorDef(floors, n);
  const reinforcements = opts.reinforcements ?? 0;
  if (!Number.isInteger(reinforcements) || reinforcements < 0) {
    throw new RangeError(`invalid reinforcements: ${reinforcements}`);
  }
  const rng = new Rng(`floor:${seed}:${n}`);

  // 1) 形（グリッド上の木）
  const cells: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  const links: string[][] = [[]];
  const taken = new Set(["0,0"]);
  while (cells.length < def.rooms) {
    const from = rng.int(0, cells.length - 1);
    const c = cells[from] as { x: number; y: number };
    const free = DIRS.map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })).filter(
      (p) => !taken.has(`${p.x},${p.y}`),
    );
    if (free.length === 0) continue;
    const p = rng.pick(free);
    const id = cells.length;
    cells.push(p);
    taken.add(`${p.x},${p.y}`);
    links.push([`r${from}`]);
    (links[from] as string[]).push(`r${id}`);
  }
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));

  // 2) ラベル（開始部屋は固定、他はシードで割り当て）
  const labels = rng.shuffle(floors.labels);

  const shape: FloorState = {
    number: n,
    boss: def.boss,
    rooms: cells.map((c, i): RoomState => ({
      id: `r${i}`,
      label: i === 0 ? floors.startLabel : (labels[i - 1] as string),
      x: c.x - minX,
      y: c.y - minY,
      neighbors: links[i] as string[],
      visited: i === 0,
      content: { kind: "empty" },
    })),
  };

  // 3) 中身
  const far = farthestRoom(shape);
  const contents = new Map<string, RoomContent>();
  contents.set(
    far,
    def.boss ? { kind: "bug", bugs: [rng.pick(def.pool)], boss: true } : { kind: "stairs" },
  );
  const rest = rng.shuffle(
    shape.rooms.map((r) => r.id).filter((id) => id !== START_ROOM && id !== far),
  );
  let k = 0;
  if (def.chest !== null) contents.set(rest[k++] as string, { kind: "chest", skill: def.chest });
  const bugRooms: string[] = [];
  for (let i = 0; i < def.bugs; i++) {
    const id = rest[k++] as string;
    contents.set(id, { kind: "bug", bugs: [rng.pick(def.pool)] });
    bugRooms.push(id);
  }
  for (let i = 0; i < reinforcements; i++) {
    const bug = rng.pick(def.pool);
    const empty = rest[k];
    if (empty !== undefined) {
      k++;
      contents.set(empty, { kind: "bug", bugs: [bug] });
      bugRooms.push(empty);
    } else if (bugRooms.length > 0) {
      const id = rng.pick(bugRooms);
      const cur = contents.get(id) as Extract<RoomContent, { kind: "bug" }>;
      contents.set(id, { ...cur, bugs: [...cur.bugs, bug] });
    } else {
      // 通常バグの部屋が1つも無い階（bugs: 0 かつ空き無し）。ボス部屋には足さない
      throw new RangeError(`floor ${n}: 増援を入れる部屋がありません`);
    }
  }

  return {
    ...shape,
    boss: def.boss,
    rooms: shape.rooms.map((r) => ({ ...r, content: contents.get(r.id) ?? r.content })),
  };
}

// ---- テスト用 ----

/**
 * 固定の1階（3部屋の一本道）。r1 に off-by-one が1体。
 *   r0 main() ─ r1 parse() ─ r2 render()
 */
export function fixedFloor(): FloorState {
  return {
    number: 1,
    boss: false,
    rooms: [
      {
        id: "r0",
        label: "main()",
        x: 0,
        y: 0,
        neighbors: ["r1"],
        visited: true,
        content: { kind: "empty" },
      },
      {
        id: "r1",
        label: "parse()",
        x: 1,
        y: 0,
        neighbors: ["r0", "r2"],
        visited: false,
        content: { kind: "bug", bugs: ["off-by-one"] },
      },
      {
        id: "r2",
        label: "render()",
        x: 2,
        y: 0,
        neighbors: ["r1"],
        visited: false,
        content: { kind: "empty" },
      },
    ],
  };
}

/** n 階に出る候補（spec v0.2 決定3: 1階は2種、2階以降は全5種）。floors.json の pool。 */
export function candidatesForFloor(floorNumber: number): readonly BugId[] {
  return loadFloors().floors[floorNumber - 1]?.pool ?? BUG_IDS;
}
