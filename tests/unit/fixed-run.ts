import { fixedFloor } from "../../src/core/floor";
import { initRun, type RunState } from "../../src/core/run";

/**
 * テスト用: 1階を固定の小さな階（r0 ─ r1(off-by-one) ─ r2）に差し替えたラン。
 * 戦闘や不正操作のルールを、生成された階の形に左右されずに確かめるために使う。
 */
export function initFixedRun(seed: string): RunState {
  return { ...initRun(seed), floor: fixedFloor() };
}
