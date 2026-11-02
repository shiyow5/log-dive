import { fnv1a } from "../../src/core/checksum";

/**
 * キーの順番に左右されない JSON 文字列（stateHash 用）。
 * 本物のゲームが `stateHash()` を公開したら、そちらに差し替える（qa-plan-v3 §1）。
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError(`stateHash: non-finite number ${String(value)}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** state の指紋。同じ state → 同じ文字列。 */
export function stateHash(state: unknown): string {
  return fnv1a(stableStringify(state));
}
