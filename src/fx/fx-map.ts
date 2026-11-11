import * as campfire from "pixelfx/fx/fire/campfire";
import * as candle from "pixelfx/fx/fire/candle";
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
    // #115: マップ中央（現在地・部屋名が並ぶ所）に炎を置かない。上端の帯(y=14)に寄せる
    { mod: smallExplosion, x: 160, y: 14, options: { size: 0.4 }, layer: "front" },
    { mod: confetti, x: 160, y: 8, layer: "front" },
  ],
  chestOpen: [{ mod: collectBurst, x: 160, y: 90, layer: "front" }],
  // 階段は暗転フェード（MapScene）が主役。全画面系(blinds/dissolve)は重ねず、小さな光だけ添える
  // #115: マップ中央ではなく上端の帯に出す（現在地・部屋名を覆わない）
  stairs: [{ mod: collectBurst, x: 160, y: 14, layer: "front" }],
  // 英語バナー文字は出さない（「復旧完了」と重複・#128 fumino v1.0）。リボンと封印の演出は維持
  result: [{ mod: questComplete, x: 160, y: 20, options: { text: "" }, layer: "front" }],
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
