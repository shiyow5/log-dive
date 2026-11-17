/**
 * 戦闘中のチュートリアル（Issue #59 PR-1）。Step1「再現」の案内だけ。画面（Phaser/DOM）に依存しない状態機械。
 *
 * 1階の最初の戦闘で「Reproduce を押してね」と案内する。Reproduce を押す / 3ターン待つ / スキップのどれかで
 * 終わり、保存フラグ `tutorial.battle`（マップ側 #64 の `tutorial.map` とは別）に残して2回目以降は出さない。
 * `?seed=`（QA フック）のときは出さず、フラグも書かない。
 */
import { SaveStore, type KeyValueStorage } from "../core/save";
import type { RunState } from "./run-port";

export const BATTLE_TUTORIAL_KEY = "tutorial.battle";
const FLAG_VERSION = 1;
/** Reproduce を押さないままこのターン数が過ぎたら自動で終わる（詰まり回避）。 */
export const TIMEOUT_TURNS = 3;
export const BATTLE_TUTORIAL_TEXT =
  "まずは、今の症状を再現してみましょう。枠で光っている「再現手順」ボタンを押してください";

/** 未保存のときだけ true。破損・未知の値・ストレージ例外は「出さない」側に倒す。 */
export function shouldShowBattleTutorial(storage: KeyValueStorage): boolean {
  try {
    const r = new SaveStore<unknown>(storage, BATTLE_TUTORIAL_KEY, FLAG_VERSION).load();
    return !r.ok && r.reason === "missing";
  } catch {
    return false;
  }
}

export class BattleTutorial {
  private running = false;
  /** 開始時の s.stats.turns。経過ターン = 現在値 − これ（スキル使用ではターンが進まない）。 */
  private startTurns = 0;

  constructor(
    private readonly storage: KeyValueStorage,
    /** `?seed=`（QA フック）で起動したか。true の間は出さず、フラグも書かない。 */
    private readonly qaSeed: boolean,
  ) {}

  get active(): boolean {
    return this.running;
  }

  /** 戦闘画面に入るたびに呼ぶ。1階・戦闘中・未再現・未保存・非 QA のときだけ始める（再入室では続きから）。 */
  start(s: RunState): void {
    if (this.running) return;
    if (this.qaSeed) return;
    if (s.floor.number !== 1 || s.phase !== "battle" || !s.battle || s.battle.reproduced) return;
    if (!shouldShowBattleTutorial(this.storage)) return;
    this.running = true;
    this.startTurns = s.stats.turns;
  }

  /** 操作のあと（再描画の前）に最新の状態を渡す。 */
  observe(s: RunState): void {
    if (!this.running) return;
    const left = s.phase !== "battle" || !s.battle;
    if (left || s.battle?.reproduced || s.stats.turns - this.startTurns >= TIMEOUT_TURNS)
      this.finish("done");
  }

  skip(): void {
    if (this.running) this.finish("skipped");
  }

  private finish(value: "done" | "skipped"): void {
    this.running = false;
    try {
      new SaveStore<string>(this.storage, BATTLE_TUTORIAL_KEY, FLAG_VERSION).save(value);
    } catch {
      // 保存できなくても案内は閉じる
    }
  }
}

let shared: BattleTutorial | null = null;

/** アプリ全体で1つ。`?seed=` の有無はここで決める。 */
export function battleTutorial(qaSeed: boolean): BattleTutorial {
  if (!shared) {
    let storage: KeyValueStorage;
    try {
      storage = localStorage;
    } catch {
      storage = { getItem: () => "unreadable", setItem: () => {}, removeItem: () => {} };
    }
    shared = new BattleTutorial(storage, qaSeed);
  }
  return shared;
}
