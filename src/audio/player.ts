/**
 * SE / BGM を鳴らす（ZzFX・ZzFXM）。
 *
 * - zzfx は読み込んだ時点で AudioContext を作るので、最初のユーザー操作のあとに動的 import する
 *   （自動再生の制限に引っかからない・Node のテストからは読まれない）。
 * - `?fx=0` では音も鳴らさない（演出を切るフラグ。e2e 用）。
 * - ミュートは localStorage に保存する。BGM もミュートで止まる。
 * - どこで失敗しても例外にしない（音が出ないだけ）。
 */
import { flags } from "../ui/flags";
import { BGM_BPM, BGM_INSTRUMENTS, BGM_PATTERNS, BGM_SEQUENCE, SFX, type SfxName } from "./sounds";
import { renderSong } from "./zzfxm";

type Engine = typeof import("zzfx");

const MUTE_KEY = "ld-audio-muted";
/** BGM は SE より小さく。 */
const BGM_VOLUME = 0.5;

let engine: Engine | null = null;
let loading: Promise<Engine | null> | null = null;
let bgm: AudioBufferSourceNode | null = null;
let bgmSamples: [number[], number[]] | null = null;
let bgmWanted = false;
/** 保存できなかったときのために、この画面でのミュート状態を持っておく。 */
let mutedInMemory: boolean | null = null;

/** 音を出してよい環境か（?fx=0 ではない）。 */
export function audioAvailable(): boolean {
  return flags().fx;
}

export function isMuted(): boolean {
  if (mutedInMemory !== null) return mutedInMemory;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function canPlay(): boolean {
  return audioAvailable() && !isMuted();
}

function load(): Promise<Engine | null> {
  loading ??= import("zzfx")
    .then((m) => {
      engine = m;
      if (m.ZZFX.audioContext.state === "suspended") void m.ZZFX.audioContext.resume();
      return m;
    })
    .catch(() => null);
  return loading;
}

/** 効果音を鳴らす。 */
export function playSfx(name: SfxName): void {
  if (!canPlay()) return;
  const params = SFX[name];
  const play = (e: Engine | null) => {
    // 読み込み待ちの間にミュートされたら鳴らさない
    if (!canPlay()) return;
    try {
      e?.zzfx(...params);
    } catch {
      // 音が出ないだけ
    }
  };
  if (engine) play(engine);
  else void load().then(play);
}

function startBgmNow(e: Engine): void {
  if (bgm || !bgmWanted || !canPlay()) return;
  try {
    bgmSamples ??= renderSong(
      BGM_INSTRUMENTS,
      BGM_PATTERNS,
      BGM_SEQUENCE,
      BGM_BPM,
      e.ZZFX.sampleRate,
      e.ZZFX.buildSamples.bind(e.ZZFX),
    );
    bgm = e.ZZFX.playSamples(bgmSamples, BGM_VOLUME, 1, 0, true);
  } catch {
    bgm = null;
  }
}

/** BGM をループ再生する（再生中なら何もしない）。 */
export function startBgm(): void {
  bgmWanted = true;
  if (!canPlay()) return;
  void load().then((e) => {
    // 曲の生成は少し重いので、押した操作の反応を先に返す
    if (e) setTimeout(() => startBgmNow(e), 0);
  });
}

function stopBgmNow(): void {
  try {
    bgm?.stop();
  } catch {
    // すでに止まっている
  }
  bgm = null;
}

/** ミュートを切り替える。戻り値は切り替え後のミュート状態。 */
export function toggleMute(): boolean {
  const next = !isMuted();
  mutedInMemory = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // 保存できなくてもこの画面では切り替える
  }
  if (next) stopBgmNow();
  else if (bgmWanted) startBgm();
  return next;
}

/**
 * 最初のクリック・キー入力で BGM を始める（ブラウザはユーザー操作前の再生を許さない）。
 * main.ts から1回だけ呼ぶ。
 */
export function startBgmOnFirstInput(): void {
  if (!audioAvailable()) return;
  const once = () => {
    document.removeEventListener("pointerdown", once, true);
    document.removeEventListener("keydown", once, true);
    startBgm();
  };
  document.addEventListener("pointerdown", once, true);
  document.addEventListener("keydown", once, true);
}
