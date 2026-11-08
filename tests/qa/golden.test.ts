import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Reducer } from "../../src/core/replay";
import {
  loadGoldens,
  parseGolden,
  playGolden,
  shouldUpdateGolden,
  writeGolden,
  type LoadedGolden,
} from "./golden";
import { stableStringify, stateHash } from "./hash";
import { toyReducer, type ToyState } from "./toy";
import { runReducer } from "../../src/core/run";

/**
 * LD-01: 同じ seed＋同じ行動列 → 同じ stateHash。
 * tests/fixtures/replays/*.json を全部再生して期待値と比べる。
 * 本物の reducer が入ったら REDUCERS に `"log-dive": logDiveReducer` を足す（未登録の reducer のフィクスチャは todo になる）。
 */
const REDUCERS: Record<string, Reducer<unknown, unknown>> = {
  toy: toyReducer as Reducer<unknown, unknown>,
  "log-dive": runReducer,
};

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/replays", import.meta.url));
const goldens = loadGoldens(FIXTURE_DIR);

describe("golden replays (tests/fixtures/replays)", () => {
  it("フィクスチャが1本以上ある", () => {
    expect(goldens.length).toBeGreaterThan(0);
  });

  for (const g of goldens) {
    const reducer = REDUCERS[g.fixture.reducer];
    if (!reducer) {
      it.todo(`${g.file}: reducer "${g.fixture.reducer}" が未登録`);
      continue;
    }
    it(`${g.file}: stateHash が期待値と一致`, () => {
      const out = playGolden(reducer, g.fixture);
      if (shouldUpdateGolden() && out.actual !== out.expected) writeGolden(g, out.actual);
      else expect(out.actual, `${g.file} (seed=${g.fixture.replay.seed})`).toBe(out.expected);
    });
  }
});

describe("golden 足場そのもの（おもちゃ reducer）", () => {
  const win = goldens.find((g) => g.fixture.name === "toy-win") as LoadedGolden;

  it("2回再生しても同じ stateHash（決定性）", () => {
    const a = playGolden(toyReducer, win.fixture);
    const b = playGolden(toyReducer, win.fixture);
    expect(a.actual).toBe(b.actual);
  });

  it("期待値に書いた result / turn と実際の state が合っている", () => {
    for (const g of goldens.filter((x) => x.fixture.reducer === "toy")) {
      const { state } = playGolden(toyReducer, g.fixture) as { state: ToyState };
      expect({ result: state.result, turn: state.turn }).toEqual({
        result: g.fixture.expected.result,
        turn: g.fixture.expected.turn,
      });
    }
  });

  it("行動を1つ変える・seed を変えると stateHash が変わる（ハッシュが鈍くない）", () => {
    const base = playGolden(toyReducer, win.fixture).actual;
    const swapped = {
      ...win.fixture,
      replay: { ...win.fixture.replay, actions: ["reproduce", "patch", "wait"] },
    };
    const reseeded = { ...win.fixture, replay: { ...win.fixture.replay, seed: "golden-x" } };
    expect(playGolden(toyReducer, swapped).actual).not.toBe(base);
    expect(playGolden(toyReducer, reseeded).actual).not.toBe(base);
  });

  it("ルールが変わったら検出できる（ダメージ式を1だけ変えた reducer で不一致）", () => {
    const drifted: Reducer<ToyState, unknown> = {
      init: toyReducer.init,
      apply: (s, a) => {
        const n = toyReducer.apply(s, a as never);
        return { ...n, hp: Math.max(0, n.hp - 1) };
      },
    };
    const out = playGolden(drifted, win.fixture);
    expect(out.actual).not.toBe(out.expected);
  });

  it("stateHash はキーの順番に左右されない", () => {
    expect(stateHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(
      stateHash({ b: [1, { d: 3, c: 2 }], a: 1 }),
    );
    expect(stableStringify({ x: undefined, y: 1 })).toBe('{"y":1}');
    expect(() => stateHash({ hp: NaN })).toThrow(TypeError);
  });

  it("形の壊れたフィクスチャは読み込みで落ちる（黙って通らない）", () => {
    const ok = readFileSync(win.path, "utf8");
    expect(() => parseGolden("x.json", ok)).not.toThrow();
    expect(() => parseGolden("x.json", "{")).toThrow(/JSON ではない/);
    expect(() => parseGolden("x.json", "[]")).toThrow(/オブジェクト/);
    const j = JSON.parse(ok) as Record<string, unknown>;
    const broken = (patch: Record<string, unknown>) =>
      parseGolden("x.json", JSON.stringify({ ...j, ...patch }));
    expect(() => broken({ reducer: "" })).toThrow(/reducer/);
    expect(() => broken({ replay: { ...(j.replay as object), actions: "x" } })).toThrow(/actions/);
    expect(() => broken({ replay: { ...(j.replay as object), seed: 1 } })).toThrow(/seed/);
    expect(() => broken({ expected: { stateHash: "XYZ" } })).toThrow(/stateHash/);
    expect(() => broken({ expected: undefined })).toThrow(/expected/);
  });

  it("QA_UPDATE_GOLDEN=1 のときだけ更新モード、writeGolden は期待値だけ書き換える", () => {
    expect(shouldUpdateGolden({})).toBe(false);
    expect(shouldUpdateGolden({ QA_UPDATE_GOLDEN: "1" })).toBe(true);
    expect(shouldUpdateGolden({ QA_UPDATE_GOLDEN: "true" })).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), "golden-"));
    const path = join(dir, "toy-win.json");
    writeFileSync(path, readFileSync(win.path, "utf8"));
    const [copy] = loadGoldens(dir) as [LoadedGolden];
    writeGolden(copy, "deadbeef");
    const [after] = loadGoldens(dir) as [LoadedGolden];
    expect(after.fixture.expected.stateHash).toBe("deadbeef");
    expect(after.fixture.replay).toEqual(win.fixture.replay);
    expect(after.fixture.expected.result).toBe("win");
  });
});

describe("LD-01 本物のゴールデン（Log Dive の reducer 待ち）", () => {
  it.todo("縦切り: 1部屋移動 → バグ1種と戦闘 → 終了 のリプレイ（qa-plan-v3 §3-1）");

  it.todo("最小版: クリアのリプレイ");

  it.todo("最小版: 死亡（HP 0）のリプレイ");

  it.todo("最小版: 途中セーブ→ロード→続き が通しと同じ stateHash（LD-02）");
});
