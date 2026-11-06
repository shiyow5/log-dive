import { loadGameData, skillDef } from "../../src/core/data";
import { distancesFrom } from "../../src/core/floor";
import type { Action, RoomState, RunState } from "../../src/core/run";

const data = loadGameData();

function room(s: RunState, pred: (r: RoomState) => boolean): RoomState | undefined {
  return s.floor.rooms.find(pred);
}

/** 今いる部屋から target へ向かう最初の1歩（隣の部屋の id）。 */
function stepToward(s: RunState, target: string): string {
  const dist = distancesFrom(s.floor, target);
  const here = room(s, (r) => r.id === s.roomId)!;
  let best = here.neighbors[0] as string;
  for (const n of here.neighbors) if ((dist.get(n) ?? 99) < (dist.get(best) ?? 99)) best = n;
  return best;
}

/**
 * 正体を知っている BOT の1手（ルールの配線を確かめるため。強さは見ない）。
 * マップ: 宝箱 → 通常バグ → 階段かボス の順に向かう。戦闘: reproduce → 正解 patch → ターン終了。
 */
export function oracleAction(s: RunState): Action {
  if (s.phase === "battle" && s.battle) {
    if (!s.battle.reproduced) return { t: "skill", id: "reproduce" };
    if (s.player.cpu >= skillDef(data, "patch").cpu) {
      return { t: "skill", id: "patch", arg: s.battle.bug };
    }
    return { t: "endTurn" };
  }
  const here = room(s, (r) => r.id === s.roomId)!;
  if (here.content.kind === "chest") return { t: "loot", pick: here.content.skill };
  const target =
    room(s, (r) => r.content.kind === "chest") ??
    room(s, (r) => r.content.kind === "bug" && r.content.boss !== true) ??
    room(s, (r) => r.content.kind === "stairs" || (r.content.kind === "bug" && !!r.content.boss));
  return { t: "move", room: stepToward(s, target!.id) };
}
