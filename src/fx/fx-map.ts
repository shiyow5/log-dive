import * as blinds from "pixelfx/fx/transitions/blinds";
import * as pixelDissolve from "pixelfx/fx/transitions/pixel-dissolve";
import * as campfire from "pixelfx/fx/fire/campfire";
import * as candle from "pixelfx/fx/fire/candle";
import * as chestOpen from "pixelfx/fx/pickups/chest-open";
import * as collectBurst from "pixelfx/fx/pickups/collect-burst";
import * as smallExplosion from "pixelfx/fx/explosions/small-explosion";
import * as confetti from "pixelfx/fx/ui/confetti";
import * as questComplete from "pixelfx/fx/ui/quest-complete";
import * as glitch from "pixelfx/fx/scifi/glitch";
import * as hitFlash from "pixelfx/fx/impacts/hit-flash";
import * as hitSpark from "pixelfx/fx/impacts/hit-spark";
import * as lightningStrike from "pixelfx/fx/lightning/lightning-strike";
import * as thunderclap from "pixelfx/fx/lightning/thunderclap";
import * as fireflies from "pixelfx/fx/weather/fireflies";
import * as cherryBlossoms from "pixelfx/fx/weather/cherry-blossoms";
import type { FxModule, FxOptions } from "pixelfx";
import { BUG_POS } from "../config";
import type { RunEvent } from "../scenes/run-port";

/**
 * 「ゲーム内イベント名 → pixelfx エフェクト」の対応表（唯一の置き場）。
 * シーンはイベント名で呼ぶだけ。pixelfx を直接 import しない。
 * 演出専用。ルール(src/core)からは参照しない。
 */
export type FxEventName =
  | "boot"
  | "title"
  | "battleStart"
  | "bugHit"
  | "playerHit"
  | "bugDefeated"
  | "chestOpen"
  | "stairs"
  | "result"
  | "mapAmbient";

export interface FxSpec {
  mod: FxModule;
  /** 画面内ドット座標（エフェクトの origin をここに置く）。全画面系は 0,0 か (160,170) など */
  x?: number;
  y?: number;
  options?: FxOptions;
  /** ループ系を一発ものとして使うときの再生秒数 */
  ttl?: number;
  /** back = 画面の背景側レイヤー / front = 手前 */
  layer: "back" | "front";
}

export const FX_MAP: Readonly<Record<FxEventName, readonly FxSpec[]>> = {
  boot: [{ mod: glitch, x: 160, y: 90, ttl: 0.6, layer: "front" }],
  title: [
    { mod: fireflies, x: 160, y: 170, layer: "back" },
    { mod: cherryBlossoms, x: 160, y: 170, layer: "back" },
  ],
  // 敵・敵名・HP バーに重ならないよう、全部 back レイヤー（描画物の後ろ）に置く。
  // 雷は敵の左右に振り分け、glitch は短く(0.6 秒)。Issue #106
  battleStart: [
    { mod: glitch, ...BUG_POS, ttl: 0.6, layer: "back" },
    { mod: lightningStrike, x: BUG_POS.x - 80, y: BUG_POS.y + 24, layer: "back" },
    { mod: thunderclap, x: BUG_POS.x + 80, y: BUG_POS.y + 20, layer: "back" },
  ],
  bugHit: [{ mod: hitSpark, ...BUG_POS, layer: "front" }],
  playerHit: [
    { mod: hitFlash, x: 160, y: 150, layer: "front" },
    { mod: hitSpark, x: 160, y: 150, layer: "front" },
  ],
  bugDefeated: [
    { mod: smallExplosion, x: 160, y: 100, options: { size: 0.5 }, layer: "front" },
    { mod: confetti, x: 160, y: 120, layer: "front" },
  ],
  chestOpen: [
    { mod: chestOpen, x: 160, y: 110, layer: "front" },
    { mod: collectBurst, x: 160, y: 90, layer: "front" },
  ],
  stairs: [
    { mod: blinds, x: 0, y: 0, layer: "front" },
    { mod: pixelDissolve, x: 0, y: 0, layer: "front" },
  ],
  result: [{ mod: questComplete, x: 160, y: 20, layer: "front" }],
  mapAmbient: [
    { mod: campfire, x: 28, y: 138, layer: "back" },
    { mod: candle, x: 296, y: 138, layer: "back" },
  ],
};

/** ゲーム側のイベント(RunEvent)を演出イベント名にする。演出のないイベントは null。 */
export function fxNameFor(e: RunEvent): FxEventName | null {
  switch (e.t) {
    case "battleStart":
      return "battleStart";
    case "bugDamaged":
      return "bugHit";
    case "playerDamaged":
      return "playerHit";
    case "bugClosed":
      return "bugDefeated";
    case "looted":
      return "chestOpen";
    case "descended":
      return "stairs";
    case "runEnd":
      return e.phase === "won" ? "result" : null;
    default:
      return null;
  }
}
