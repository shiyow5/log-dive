/**
 * 階の構成。
 *
 * いまは縦切り用の「固定の小さな階」だけ（dev-plan-v3 §3 S2）。
 * シード付きの階生成（3階・到達性テスト）は 11/06 の PR でここに入れる。
 */
import { BUG_IDS, type BugId } from "./data";
import type { FloorState } from "./run";

/** 開始部屋の id。 */
export const FIXED_START_ROOM = "r0";

/**
 * 固定の1階（3部屋の一本道）。r1 に off-by-one が1体。
 *   r0 main() ─ r1 parse() ─ r2 render()
 */
export function fixedFloor(): FloorState {
  return {
    number: 1,
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

/** 1階に出る候補（spec v0.2 決定3）。2階以降は全5種。 */
export function candidatesForFloor(floorNumber: number): readonly BugId[] {
  return floorNumber === 1 ? ["off-by-one", "null-ref"] : BUG_IDS;
}
