import { describe, expect, it } from "vitest";
import {
  ENEMY_SIZE,
  ENEMY_SPRITES,
  enemyKindFor,
  type EnemyKind,
} from "../../src/art/enemy-sprites";

describe("enemy-sprites", () => {
  for (const kind of Object.keys(ENEMY_SPRITES) as EnemyKind[]) {
    for (const frame of ["idle", "hit"] as const) {
      it(`${kind}/${frame} は 16x16 で、palette にない文字がない`, () => {
        const spr = ENEMY_SPRITES[kind];
        const rows = spr[frame];
        expect(rows).toHaveLength(ENEMY_SIZE);
        for (const r of rows) {
          expect(r).toHaveLength(ENEMY_SIZE);
          for (const ch of r)
            if (ch !== ".") expect(spr.palette[ch], `${kind}:${ch}`).toBeDefined();
        }
      });
    }
    it(`${kind}: hit は idle と別の絵`, () => {
      expect(ENEMY_SPRITES[kind].hit).not.toEqual(ENEMY_SPRITES[kind].idle);
    });
  }
  it("enemyKindFor: ボスは boss、通常は部屋 ID で決まり BugId に依存しない", () => {
    expect(enemyKindFor("r9", true)).toBe("boss");
    expect(enemyKindFor("r1", false)).toBe(enemyKindFor("r1", false));
    const kinds = new Set(["r1", "r2", "r3", "r4", "r5", "r6"].map((r) => enemyKindFor(r, false)));
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  });
});
