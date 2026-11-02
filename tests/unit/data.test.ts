import { describe, expect, it } from "vitest";
import bugsJson from "../../src/data/bugs.json";
import skillsJson from "../../src/data/skills.json";
import {
  BUG_IDS,
  DataError,
  SKILL_IDS,
  loadGameData,
  parseBugs,
  parsePlayer,
  parseSkills,
} from "../../src/core/data";

/** JSON を壊して試すための深いコピー。 */
function copy<T>(v: T): T {
  return structuredClone(v);
}

describe("data: 同梱 JSON", () => {
  const data = loadGameData();

  it("バグ5種・スキル6枚がそろっている", () => {
    expect(data.bugs.bugs.map((b) => b.id).sort()).toEqual([...BUG_IDS].sort());
    expect(data.skills.skills.map((s) => s.id).sort()).toEqual([...SKILL_IDS].sort());
  });

  it("通常バグ HP は 20 以下、ボス HP は 21〜40（spec v0.2: 通常15・ボス30・上限35）", () => {
    expect(data.bugs.limits).toEqual({ normalHpMax: 20, bossHpMin: 21, bossHpMax: 40 });
    for (const b of data.bugs.bugs) {
      expect(b.hp).toBeGreaterThanOrEqual(1);
      expect(b.hp).toBeLessThanOrEqual(20);
    }
    expect(data.bugs.boss.hp).toBeGreaterThanOrEqual(21);
    expect(data.bugs.boss.hp).toBeLessThanOrEqual(40);
    expect(data.bugs.boss.hpCap).toBeLessThanOrEqual(40);
  });

  it("正解パッチ1回で通常バグを倒せ、ボスは1回では倒せない", () => {
    const patch = data.skills.skills.find((s) => s.id === "patch")!.effect;
    expect(patch.kind).toBe("patch");
    const dmg = patch.kind === "patch" ? patch.damage : 0;
    for (const b of data.bugs.bugs) expect(dmg).toBeGreaterThanOrEqual(b.hp);
    expect(dmg).toBeLessThan(data.bugs.boss.hp);
  });

  it("開始時のスキルは reproduce / read-log / hotfix / patch の4枚", () => {
    expect(
      data.skills.skills
        .filter((s) => s.starter)
        .map((s) => s.id)
        .sort(),
    ).toEqual(["hotfix", "patch", "read-log", "reproduce"]);
  });
});

describe("data: 推理が必ず成立する", () => {
  const { bugs, boss } = loadGameData().bugs;

  it("どの2種類を比べても、少なくとも1つ違う症状がある（両方向）", () => {
    for (const a of bugs) {
      for (const b of bugs) {
        if (a.id === b.id) continue;
        const onlyA = a.symptoms.filter((s) => !b.symptoms.includes(s));
        expect(onlyA.length, `${a.id} と ${b.id} を区別できる症状が無い`).toBeGreaterThan(0);
      }
    }
  });

  it("各種類の症状3つの組がすべて異なる", () => {
    const keys = bugs.map((b) => [...b.symptoms].sort().join("|"));
    expect(new Set(keys).size).toBe(bugs.length);
  });

  it("ボスのノイズ症状はどの種類の症状とも違う（手がかりにならない）", () => {
    for (const b of bugs) expect(b.symptoms).not.toContain(boss.noiseSymptom);
  });
});

describe("data: 検証のエラー文（ファイル名と項目名つき）", () => {
  it("schemaVersion が違う", () => {
    const raw = { ...copy(bugsJson), schemaVersion: 2 };
    expect(() => parseBugs(raw)).toThrow(/^bugs\.json: schemaVersion は 1 にしてください/);
  });

  it("通常バグの HP が上限を超える", () => {
    const raw = copy(bugsJson);
    raw.bugs[2]!.hp = 25;
    expect(() => parseBugs(raw)).toThrow(
      "bugs.json: bugs[2].hp は 1〜20 の整数にしてください (実際: 25)",
    );
  });

  it("ボスの HP が範囲外", () => {
    const raw = copy(bugsJson);
    raw.boss.hp = 50;
    expect(() => parseBugs(raw)).toThrow(
      "bugs.json: boss.hp は 21〜40 の整数にしてください (実際: 50)",
    );
  });

  it("症状が3つでない", () => {
    const raw = copy(bugsJson);
    raw.bugs[0]!.symptoms.pop();
    expect(() => parseBugs(raw)).toThrow("bugs.json: bugs[0].symptoms はちょうど3つにしてください");
  });

  it("知らないバグ id", () => {
    const raw = copy(bugsJson);
    raw.bugs[1]!.id = "segfault";
    expect(() => parseBugs(raw)).toThrow(/^bugs\.json: bugs\[1\]\.id は /);
  });

  it("バグが足りない・重複する", () => {
    const raw = copy(bugsJson);
    raw.bugs[4] = copy(raw.bugs[0]!);
    expect(() => parseBugs(raw)).toThrow("bugs.json: bugs[4].id が重複しています (off-by-one)");
    raw.bugs.pop();
    expect(() => parseBugs(raw)).toThrow("bugs.json: bugs に infinite-loop がありません");
  });

  it("行動パターンの数値が欠けている", () => {
    const raw = copy(bugsJson) as unknown as { bugs: { behavior: Record<string, unknown> }[] };
    delete raw.bugs[0]!.behavior.extra;
    expect(() => parseBugs(raw)).toThrow("bugs.json: bugs[0].behavior.extra は 1〜99 の整数");
  });

  it("スキルの CPU が整数でない", () => {
    const raw = copy(skillsJson);
    raw.skills[3]!.cpu = 1.5;
    expect(() => parseSkills(raw)).toThrow(
      "skills.json: skills[3].cpu は 0〜3 の整数にしてください (実際: 1.5)",
    );
  });

  it("player.json の項目が無い", () => {
    expect(() => parsePlayer({ schemaVersion: 1, hp: 30 })).toThrow(
      "player.json: cpuPerTurn は 1〜10 の整数にしてください (実際: undefined)",
    );
  });

  it("エラーは DataError で file と path を持つ", () => {
    try {
      parseSkills({ schemaVersion: 1, skills: "x" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DataError);
      expect((e as DataError).file).toBe("skills.json");
      expect((e as DataError).path).toBe("skills");
    }
  });
});
