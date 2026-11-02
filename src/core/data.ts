/**
 * ゲームの数値データ（src/data/*.json）の型と読み込み検証。
 *
 * JSON は手で編集されるので、読み込み時に必ず検証する。
 * 不正な値は「ファイル名と項目名」入りの DataError にする（どこを直せばよいか分かるように）。
 */
import bugsJson from "../data/bugs.json";
import playerJson from "../data/player.json";
import skillsJson from "../data/skills.json";

export const DATA_SCHEMA_VERSION = 1;

export const BUG_IDS = ["off-by-one", "null-ref", "race", "leak", "infinite-loop"] as const;
export type BugId = (typeof BUG_IDS)[number];

export const SKILL_IDS = [
  "reproduce",
  "read-log",
  "hotfix",
  "patch",
  "breakpoint",
  "bisect",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** バグの行動パターン（種類ごとに持つ数値が違う）。 */
export type BugBehavior =
  | { readonly kind: "off-by-one"; readonly damage: number; readonly extra: number }
  | {
      readonly kind: "null-ref";
      readonly damage: number;
      readonly bigDamage: number;
      readonly period: number;
    }
  | { readonly kind: "race"; readonly damage: number; readonly multipliers: readonly number[] }
  | { readonly kind: "leak"; readonly damage: number; readonly growth: number }
  | { readonly kind: "infinite-loop"; readonly damage: number; readonly cpuDrain: number };

export interface BugDef {
  readonly id: BugId;
  readonly name: string;
  readonly hp: number;
  /** 公開されるヒント。種類ごとに3つ。 */
  readonly symptoms: readonly [string, string, string];
  readonly behavior: BugBehavior;
}

export interface BossDef {
  readonly hp: number;
  /** デグレで増えても超えない上限。 */
  readonly hpCap: number;
  /** 3階でデグレしたときに増える HP。 */
  readonly degradeHpBonus: number;
  readonly patchesRequired: number;
  /** ボスの最初の症状（どの種類にも当てはまるノイズ）。 */
  readonly noiseSymptom: string;
}

export interface HpLimits {
  /** 通常バグの HP 上限（これ以下）。 */
  readonly normalHpMax: number;
  /** ボス HP の範囲（両端を含む）。 */
  readonly bossHpMin: number;
  readonly bossHpMax: number;
}

export interface BugsData {
  readonly schemaVersion: 1;
  readonly limits: HpLimits;
  readonly bugs: readonly BugDef[];
  readonly boss: BossDef;
}

export type SkillEffect =
  | { readonly kind: "reproduce" }
  | { readonly kind: "read-log" }
  | { readonly kind: "hotfix"; readonly damage: number }
  | { readonly kind: "patch"; readonly damage: number }
  | { readonly kind: "breakpoint" }
  | { readonly kind: "bisect" };

export interface SkillDef {
  readonly id: SkillId;
  readonly name: string;
  readonly cpu: number;
  /** ラン開始時から持っているか（false は宝箱で入手）。 */
  readonly starter: boolean;
  readonly effect: SkillEffect;
}

export interface SkillsData {
  readonly schemaVersion: 1;
  readonly skills: readonly SkillDef[];
}

export interface PlayerData {
  readonly schemaVersion: 1;
  readonly hp: number;
  readonly cpuPerTurn: number;
}

export interface GameData {
  readonly bugs: BugsData;
  readonly skills: SkillsData;
  readonly player: PlayerData;
}

/** データファイルの不正。message は「ファイル名: 項目名 …」の形。 */
export class DataError extends Error {
  constructor(
    readonly file: string,
    readonly path: string,
    detail: string,
  ) {
    super(`${file}: ${path} ${detail}`);
    this.name = "DataError";
  }
}

// ---- 検証の小道具 ----

type Obj = Record<string, unknown>;

class Checker {
  constructor(readonly file: string) {}

  fail(path: string, detail: string): never {
    throw new DataError(this.file, path, detail);
  }

  obj(v: unknown, path: string): Obj {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      this.fail(path, "はオブジェクトにしてください");
    }
    return v as Obj;
  }

  arr(v: unknown, path: string): unknown[] {
    if (!Array.isArray(v)) this.fail(path, "は配列にしてください");
    return v;
  }

  str(v: unknown, path: string): string {
    if (typeof v !== "string" || v.trim() === "") this.fail(path, "は空でない文字列にしてください");
    return v;
  }

  bool(v: unknown, path: string): boolean {
    if (typeof v !== "boolean") this.fail(path, "は true か false にしてください");
    return v;
  }

  /** 整数で min..max（両端を含む）。 */
  int(v: unknown, path: string, min: number, max: number): number {
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      this.fail(path, `は ${min}〜${max} の整数にしてください (実際: ${JSON.stringify(v)})`);
    }
    return v;
  }

  oneOf<T extends string>(v: unknown, path: string, allowed: readonly T[]): T {
    if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
      this.fail(
        path,
        `は ${allowed.join(" / ")} のどれかにしてください (実際: ${JSON.stringify(v)})`,
      );
    }
    return v as T;
  }

  schema(root: Obj): 1 {
    if (root.schemaVersion !== DATA_SCHEMA_VERSION) {
      this.fail(
        "schemaVersion",
        `は ${DATA_SCHEMA_VERSION} にしてください (実際: ${JSON.stringify(root.schemaVersion)})`,
      );
    }
    return DATA_SCHEMA_VERSION;
  }

  /** id がすべて揃っていて重複が無いこと。 */
  complete(ids: readonly string[], expected: readonly string[], path: string): void {
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      if (seen.has(id)) this.fail(`${path}[${i}].id`, `が重複しています (${id})`);
      seen.add(id);
    });
    const missing = expected.filter((id) => !seen.has(id));
    if (missing.length > 0) this.fail(path, `に ${missing.join(", ")} がありません`);
  }
}

const MAX_DAMAGE = 99;

function parseBehavior(c: Checker, v: unknown, path: string, id: BugId): BugBehavior {
  const o = c.obj(v, path);
  const kind = c.oneOf(o.kind, `${path}.kind`, BUG_IDS);
  if (kind !== id)
    c.fail(`${path}.kind`, `はバグの id (${id}) と同じにしてください (実際: ${kind})`);
  const damage = c.int(o.damage, `${path}.damage`, 0, MAX_DAMAGE);
  switch (kind) {
    case "off-by-one":
      return { kind, damage, extra: c.int(o.extra, `${path}.extra`, 1, MAX_DAMAGE) };
    case "null-ref":
      return {
        kind,
        damage,
        bigDamage: c.int(o.bigDamage, `${path}.bigDamage`, 1, MAX_DAMAGE),
        period: c.int(o.period, `${path}.period`, 2, 10),
      };
    case "race": {
      const ms = c.arr(o.multipliers, `${path}.multipliers`);
      if (ms.length === 0) c.fail(`${path}.multipliers`, "は1つ以上にしてください");
      return {
        kind,
        damage,
        multipliers: ms.map((m, i) => c.int(m, `${path}.multipliers[${i}]`, 0, 10)),
      };
    }
    case "leak":
      return { kind, damage, growth: c.int(o.growth, `${path}.growth`, 1, MAX_DAMAGE) };
    case "infinite-loop":
      return { kind, damage, cpuDrain: c.int(o.cpuDrain, `${path}.cpuDrain`, 1, 3) };
  }
}

/** bugs.json を検証して型付きにする。不正なら DataError。 */
export function parseBugs(raw: unknown, file = "bugs.json"): BugsData {
  const c = new Checker(file);
  const root = c.obj(raw, "(ルート)");
  const schemaVersion = c.schema(root);

  const lo = c.obj(root.limits, "limits");
  const normalHpMax = c.int(lo.normalHpMax, "limits.normalHpMax", 1, 999);
  const bossHpMin = c.int(lo.bossHpMin, "limits.bossHpMin", normalHpMax + 1, 999);
  const bossHpMax = c.int(lo.bossHpMax, "limits.bossHpMax", bossHpMin, 999);
  const limits: HpLimits = { normalHpMax, bossHpMin, bossHpMax };

  const bugs = c.arr(root.bugs, "bugs").map((v, i): BugDef => {
    const p = `bugs[${i}]`;
    const o = c.obj(v, p);
    const id = c.oneOf(o.id, `${p}.id`, BUG_IDS);
    const name = c.str(o.name, `${p}.name`);
    const hp = c.int(o.hp, `${p}.hp`, 1, normalHpMax);
    const ss = c.arr(o.symptoms, `${p}.symptoms`);
    if (ss.length !== 3)
      c.fail(`${p}.symptoms`, `はちょうど3つにしてください (実際: ${ss.length})`);
    const symptoms = ss.map((s, j) => c.str(s, `${p}.symptoms[${j}]`));
    if (new Set(symptoms).size !== 3) c.fail(`${p}.symptoms`, "に同じ症状が重複しています");
    const behavior = parseBehavior(c, o.behavior, `${p}.behavior`, id);
    return { id, name, hp, symptoms: symptoms as [string, string, string], behavior };
  });
  c.complete(
    bugs.map((b) => b.id),
    BUG_IDS,
    "bugs",
  );

  const bo = c.obj(root.boss, "boss");
  const bossHp = c.int(bo.hp, "boss.hp", bossHpMin, bossHpMax);
  const boss: BossDef = {
    hp: bossHp,
    hpCap: c.int(bo.hpCap, "boss.hpCap", bossHp, bossHpMax),
    degradeHpBonus: c.int(bo.degradeHpBonus, "boss.degradeHpBonus", 0, bossHpMax),
    patchesRequired: c.int(bo.patchesRequired, "boss.patchesRequired", 1, 5),
    noiseSymptom: c.str(bo.noiseSymptom, "boss.noiseSymptom"),
  };
  if (bugs.some((b) => b.symptoms.includes(boss.noiseSymptom))) {
    c.fail("boss.noiseSymptom", "はどのバグの症状とも違う文にしてください");
  }

  return { schemaVersion, limits, bugs, boss };
}

/** skills.json を検証して型付きにする。不正なら DataError。 */
export function parseSkills(raw: unknown, file = "skills.json"): SkillsData {
  const c = new Checker(file);
  const root = c.obj(raw, "(ルート)");
  const schemaVersion = c.schema(root);
  const skills = c.arr(root.skills, "skills").map((v, i): SkillDef => {
    const p = `skills[${i}]`;
    const o = c.obj(v, p);
    const id = c.oneOf(o.id, `${p}.id`, SKILL_IDS);
    const name = c.str(o.name, `${p}.name`);
    const cpu = c.int(o.cpu, `${p}.cpu`, 0, 3);
    const starter = c.bool(o.starter, `${p}.starter`);
    const e = c.obj(o.effect, `${p}.effect`);
    const kind = c.oneOf(e.kind, `${p}.effect.kind`, SKILL_IDS);
    if (kind !== id) c.fail(`${p}.effect.kind`, `はスキルの id (${id}) と同じにしてください`);
    let effect: SkillEffect;
    if (kind === "hotfix" || kind === "patch") {
      effect = { kind, damage: c.int(e.damage, `${p}.effect.damage`, 1, MAX_DAMAGE) };
    } else {
      effect = { kind };
    }
    return { id, name, cpu, starter, effect };
  });
  c.complete(
    skills.map((s) => s.id),
    SKILL_IDS,
    "skills",
  );
  return { schemaVersion, skills };
}

/** player.json を検証して型付きにする。不正なら DataError。 */
export function parsePlayer(raw: unknown, file = "player.json"): PlayerData {
  const c = new Checker(file);
  const root = c.obj(raw, "(ルート)");
  const schemaVersion = c.schema(root);
  return {
    schemaVersion,
    hp: c.int(root.hp, "hp", 1, 999),
    cpuPerTurn: c.int(root.cpuPerTurn, "cpuPerTurn", 1, 10),
  };
}

let cached: GameData | null = null;

/** 同梱の JSON を検証して返す（1回だけ検証してキャッシュ）。 */
export function loadGameData(): GameData {
  cached ??= {
    bugs: parseBugs(bugsJson),
    skills: parseSkills(skillsJson),
    player: parsePlayer(playerJson),
  };
  return cached;
}

export function bugDef(data: GameData, id: BugId): BugDef {
  const def = data.bugs.bugs.find((b) => b.id === id);
  if (!def) throw new DataError("bugs.json", "bugs", `に ${id} がありません`);
  return def;
}

export function skillDef(data: GameData, id: SkillId): SkillDef {
  const def = data.skills.skills.find((s) => s.id === id);
  if (!def) throw new DataError("skills.json", "skills", `に ${id} がありません`);
  return def;
}
