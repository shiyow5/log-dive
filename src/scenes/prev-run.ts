import { SaveStore, type KeyValueStorage } from "../core/save";
import type { RunState } from "../core/run";

/**
 * リザルトの「前回比」（#95・rei 判断 11/17）。前回ランの到達階・倒したバグ・使ったターンを
 * localStorage に1件だけ持つ。サーバーには送らない。記録が無い・壊れているときは前回比を出さない。
 */
export interface RunRecord {
  readonly floor: number;
  readonly bugsClosed: number;
  readonly turns: number;
}

export const PREV_RUN_KEY = "log-dive:prev-run";
const PREV_RUN_VERSION = 1;

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/** 形が合わないデータ（チェックサムは合うが中身が変、など）は「記録なし」と同じに扱う。 */
function isRunRecord(v: unknown): v is RunRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return isCount(r.floor) && isCount(r.bugsClosed) && isCount(r.turns);
}

export function recordOf(s: RunState): RunRecord {
  return { floor: s.floor.number, bugsClosed: s.stats.bugsClosed, turns: s.stats.turns };
}

export function prevRunStore(storage: KeyValueStorage): SaveStore<RunRecord> {
  return new SaveStore<RunRecord>(storage, PREV_RUN_KEY, PREV_RUN_VERSION);
}

/** 前回の記録を読む。無い・壊れている・ストレージが使えないときは null（例外にしない）。 */
export function loadPrevRun(store: SaveStore<RunRecord>): RunRecord | null {
  try {
    const r = store.load();
    return r.ok && isRunRecord(r.data) ? r.data : null;
  } catch {
    return null;
  }
}

/** 今回の記録を保存する（1件だけ・上書き）。ストレージが使えなくてもリザルトは出す。 */
export function savePrevRun(store: SaveStore<RunRecord>, rec: RunRecord): void {
  try {
    store.save(rec);
  } catch {
    // 容量超過・プライベートモードなど。前回比が次回出ないだけなので握りつぶす。
  }
}

export type DiffTone = "up" | "down" | "same";

export interface Diff {
  /** 「+2 階」「−1」「±0」。符号は U+2212 のマイナス（#95 指定の表記）。色だけに頼らず記号で増減を示す。 */
  readonly text: string;
  readonly tone: DiffTone;
}

/** 今回 − 前回 の差分ラベル。unit は「階」など（指定の「+2 階」の形）。 */
export function diffOf(cur: number, prev: number, unit = ""): Diff {
  const d = cur - prev;
  const suffix = unit ? ` ${unit}` : "";
  if (d > 0) return { text: `+${d}${suffix}`, tone: "up" };
  if (d < 0) return { text: `−${-d}${suffix}`, tone: "down" };
  return { text: `±0${suffix}`, tone: "same" };
}

/** 結果表のラベルごとの前回比。前回記録が無いときは空（表示しない）。 */
export function resultDiffs(cur: RunRecord, prev: RunRecord | null): Record<string, Diff> {
  if (!prev) return {};
  return {
    到達階: diffOf(cur.floor, prev.floor, "階"),
    倒したバグ: diffOf(cur.bugsClosed, prev.bugsClosed),
    使ったターン: diffOf(cur.turns, prev.turns),
  };
}

/** ブラウザの localStorage。アクセス自体が例外になる環境（無効化など）では null。 */
export function browserStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const memo = new Map<number, RunRecord | null>();

/**
 * リザルトを開いたときに1回だけ呼ぶ想定: 前回の記録を読んでから、今回の記録で上書きする。
 * 同じラン（serial）でリザルトが作り直されても、自分自身と比べないように最初に読んだ前回値を返す。
 */
export function takePrevRun(
  serial: number,
  cur: RunRecord,
  storage: KeyValueStorage | null,
): RunRecord | null {
  if (memo.has(serial)) return memo.get(serial) ?? null;
  if (!storage) {
    memo.set(serial, null);
    return null;
  }
  const store = prevRunStore(storage);
  const prev = loadPrevRun(store);
  savePrevRun(store, cur);
  memo.clear();
  memo.set(serial, prev);
  return prev;
}
