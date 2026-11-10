/**
 * 効果音（SE）と BGM のデータ。ZzFX / ZzFXM のパラメータだけを持つ（音声ファイルは置かない）。
 *
 * ここは純粋なデータと関数だけ。鳴らすのは player.ts。
 * パラメータの並び（ZzFX 1.4）: [音量, ゆらぎ, 周波数, attack, sustain, release, 波形, 波形カーブ,
 *   slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay,
 *   sustainVolume, decay, tremolo, filter]。波形: 0 sin / 1 三角 / 2 のこぎり / 3 tan / 4 ノイズ / 5 矩形
 */
import type { RunEvent, RunState } from "../core/run";
import type { Instrument, Pattern } from "./zzfxm";

type Params = number[];

/** 効果音の一覧。名前は「どの操作・出来事か」。 */
export const SFX = {
  /** ボタンを押した（全ボタン共通）。 */
  click: [0.4, 0, 900, 0, 0.01, 0.03, 1],
  /** 新しいランを始めた。 */
  start: [0.8, 0, 440, 0, 0.08, 0.3, 1, 1, 0, 0, 440, 0.07],
  /** 押せない操作（core の lastError）。 */
  error: [0.6, 0, 140, 0, 0.06, 0.12, 5, 1, 0, 0, 0, 0, 0.05],
  moved: [0.5, 0.05, 220, 0, 0.02, 0.06, 2, 2, -8],
  battleStart: [0.7, 0, 330, 0.01, 0.06, 0.12, 5, 1, 0, 0, 165, 0.05, 0.1],
  symptom: [0.5, 0.05, 620, 0, 0.04, 0.08, 1, 1, 0, 0, 310, 0.04],
  candidateRemoved: [0.5, 0, 880, 0, 0.02, 0.06, 0, 1, 40],
  bugDamaged: [0.9, 0.05, 260, 0, 0.02, 0.12, 4, 1, -20, 0, 0, 0, 0, 0.3],
  degrade: [0.7, 0, 300, 0, 0.1, 0.25, 2, 1, -12],
  halted: [0.6, 0, 1200, 0, 0.03, 0.1, 0, 1, 0, 0, -600, 0.05],
  bugHaltedTurn: [0.5, 0, 600, 0, 0.03, 0.08, 0, 1, 0, 0, 600, 0.04],
  bugClosed: [0.8, 0, 523, 0, 0.06, 0.22, 1, 1, 0, 0, 262, 0.06],
  stairsOpened: [0.7, 0, 392, 0, 0.08, 0.3, 0, 1, 0, 0, 196, 0.08, 0.08],
  descended: [0.7, 0, 660, 0, 0.1, 0.3, 1, 1, -30],
  looted: [0.8, 0, 784, 0, 0.05, 0.25, 1, 1, 0, 0, 392, 0.05, 0.1],
  playerDamaged: [0.9, 0.1, 120, 0, 0.05, 0.2, 4, 1, -5, 0, 0, 0, 0, 0.5],
  won: [0.9, 0, 523, 0, 0.2, 0.5, 1, 1, 0, 0, 262, 0.1, 0.2],
  lost: [0.9, 0, 220, 0, 0.3, 0.6, 2, 1, -8],
  abandoned: [0.6, 0, 330, 0, 0.05, 0.2, 1, 1, -20],
} satisfies Record<string, Params>;

export type SfxName = keyof typeof SFX;

/** 1回の操作で鳴らすのは1つだけ。上ほど優先（同時に鳴らすと濁るため）。 */
const EVENT_PRIORITY: readonly RunEvent["t"][] = [
  "runEnd",
  "descended",
  "stairsOpened",
  "bugClosed",
  "looted",
  "degrade",
  "playerDamaged",
  "bugDamaged",
  "halted",
  "bugHaltedTurn",
  "candidateRemoved",
  "symptom",
  "reproduced",
  "battleStart",
  "moved",
];

function sfxForEvent(e: RunEvent): SfxName {
  if (e.t === "runEnd") return e.phase;
  // 症状なしの再現は、症状が出たときと同じ音（新しい SE は足さない）
  if (e.t === "reproduced") return "symptom";
  return e.t;
}

/**
 * 操作の結果（dispatch 後の状態）から鳴らす SE を決める。鳴らすものが無ければ null。
 * エラーならエラー音、そうでなければ起きた出来事のうち一番優先度が高いもの。
 */
export function sfxForRun(s: Pick<RunState, "lastError" | "events">): SfxName | null {
  if (s.lastError) return "error";
  let best: RunEvent | null = null;
  for (const e of s.events) {
    if (!best || EVENT_PRIORITY.indexOf(e.t) < EVENT_PRIORITY.indexOf(best.t)) best = e;
  }
  return best ? sfxForEvent(best) : null;
}

// ---- BGM「Log Dive」(A マイナー、ループ) ----
// 音符は楽器の基準周波数を 12 とした半音の数（13 = 半音上）。0 = 前の音を伸ばす。

/** 楽器: 0 リード(矩形) / 1 ベース(三角) / 2 ハイハット(ノイズ)。 */
export const BGM_INSTRUMENTS: readonly Instrument[] = [
  [0.35, 0, 440, 0.01, 0.08, 0.2, 5, 1],
  [0.7, 0, 110, 0.01, 0.12, 0.15, 1],
  [0.12, 0, 4000, 0, 0, 0.03, 4],
];

const HAT = [12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0];

export const BGM_PATTERNS: readonly Pattern[] = [
  // Am
  [
    [0, 0, 12, 0, 15, 0, 19, 0, 17, 0, 15, 0, 12, 0, 10, 0, 12, 0],
    [1, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 7, 0, 0, 0],
    [2, 0.3, ...HAT],
  ],
  // F → G
  [
    [0, 0, 8, 0, 12, 0, 15, 0, 12, 0, 10, 0, 14, 0, 17, 0, 14, 0],
    [1, 0, 8, 0, 0, 0, 8, 0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0],
    [2, 0.3, ...HAT],
  ],
  // Am → Em
  [
    [0, 0, 24, 0, 0, 0, 19, 0, 0, 0, 22, 0, 20, 0, 19, 0, 0, 0],
    [1, 0, 12, 0, 0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 7, 0, 0, 0],
    [2, 0.3, ...HAT],
  ],
  // E → Am（終止）
  [
    [0, 0, 19, 0, 14, 0, 11, 0, 14, 0, 12, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 7, 0, 0, 0, 7, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 0],
    [2, 0.3, ...HAT],
  ],
];

export const BGM_SEQUENCE: readonly number[] = [0, 1, 0, 1, 2, 3];
export const BGM_BPM = 110;
