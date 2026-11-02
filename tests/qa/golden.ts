import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runReplay, type Reducer, type Replay } from "../../src/core/replay";
import { stateHash } from "./hash";

/**
 * ゴールデンリプレイ 1本 = tests/fixtures/replays/*.json の1ファイル。
 * `reducer` は再生に使うルールの名前（golden.test.ts の REDUCERS に登録したもの）。
 */
export interface GoldenFixture {
  readonly name: string;
  readonly reducer: string;
  readonly note?: string;
  readonly replay: Replay<unknown>;
  readonly expected: { readonly stateHash: string; readonly [k: string]: unknown };
}

export interface LoadedGolden {
  readonly file: string;
  readonly path: string;
  readonly fixture: GoldenFixture;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 形が違うフィクスチャは「テストが通ったように見える」のを防ぐため、読み込みで落とす。 */
export function parseGolden(file: string, raw: string): GoldenFixture {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${file}: JSON ではない (${(e as Error).message})`, { cause: e });
  }
  const fail = (what: string): never => {
    throw new Error(`${file}: ${what}`);
  };
  if (!isObj(v)) return fail("トップがオブジェクトではない");
  if (typeof v.name !== "string" || v.name === "") fail("name が無い");
  if (typeof v.reducer !== "string" || v.reducer === "") fail("reducer が無い");
  const r = v.replay;
  if (!isObj(r)) return fail("replay が無い");
  if (typeof r.game !== "string") fail("replay.game が文字列ではない");
  if (typeof r.version !== "number") fail("replay.version が数値ではない");
  if (typeof r.seed !== "string") fail("replay.seed が文字列ではない");
  if (!Array.isArray(r.actions)) fail("replay.actions が配列ではない");
  const ex = v.expected;
  if (!isObj(ex)) return fail("expected が無い");
  if (typeof ex.stateHash !== "string" || !/^[0-9a-f]{8}$/.test(ex.stateHash)) {
    fail("expected.stateHash が 8桁の16進ではない");
  }
  return v as unknown as GoldenFixture;
}

export function loadGoldens(dir: string): LoadedGolden[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const path = join(dir, file);
      return { file, path, fixture: parseGolden(file, readFileSync(path, "utf8")) };
    });
}

export interface GoldenOutcome<S> {
  readonly actual: string;
  readonly expected: string;
  readonly state: S;
}

/** 再生して stateHash を出す。比較はテスト側で行う（差分を見やすくするため）。 */
export function playGolden<S>(
  reducer: Reducer<S, unknown>,
  fixture: GoldenFixture,
  hash: (s: S) => string = stateHash,
): GoldenOutcome<S> {
  const state = runReplay(reducer, fixture.replay);
  return { actual: hash(state), expected: fixture.expected.stateHash, state };
}

/**
 * `QA_UPDATE_GOLDEN=1 npm test` のときだけ期待値を書き換える。
 * ルールを意図して変えたときに使う。差分は PR で必ずレビューする。
 */
export function shouldUpdateGolden(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.QA_UPDATE_GOLDEN === "1";
}

export function writeGolden(g: LoadedGolden, actual: string): void {
  const next = { ...g.fixture, expected: { ...g.fixture.expected, stateHash: actual } };
  writeFileSync(g.path, `${JSON.stringify(next, null, 2)}\n`);
}
