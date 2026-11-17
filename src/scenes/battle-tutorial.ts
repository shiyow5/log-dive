/**
 * 戦闘中のチュートリアル（Issue #59）。画面（Phaser/DOM）に依存しない状態機械。
 *
 * 1階の最初の戦闘で 1手ずつ案内する: ① 再現 → ② ログで候補を絞る → ③ パッチを当てる（戦闘が終わると案内も終わる）。
 * - 各ステップは RunState の変化で進む（reproduced / 候補が減る）。案内以外のボタンを押しても案内は消えず、詰まらない。
 * - ①②は、押されないまま TIMEOUT_TURNS ターン経つと次へ進む（詰まり回避）。③は戦闘が終わるまで続く。
 * - 完了とスキップは別キー（tutorial.battle_complete / tutorial.battle_skipped）に既存 save と同じ仕組みで保存し、
 *   どちらかがあれば2回目以降は出さない。マップ側 #64 の `tutorial.map` とは別。
 * - `?seed=`（QA フック）のときは出さず、フラグも書かない。`?seed=N&tutorial=battle` と明示したときだけ、
 *   保存済みでも出す（QA 用の強制表示。フラグは書かない）。
 */
import { SaveStore, type KeyValueStorage } from "../core/save";
import type { RunState } from "./run-port";

export const BATTLE_TUTORIAL_COMPLETE_KEY = "tutorial.battle_complete";
export const BATTLE_TUTORIAL_SKIPPED_KEY = "tutorial.battle_skipped";
/** PR-1（#210）が書いていた単一キー。すでに見たプレイヤーに再表示しないため、読むだけ読む。 */
const LEGACY_KEY = "tutorial.battle";
const FLAG_VERSION = 1;
/** ① ② は、押されないままこのターン数が過ぎたら次へ進む。 */
export const TIMEOUT_TURNS = 3;

export type BattleTutorialStep = 1 | 2 | 3;

export const BATTLE_TUTORIAL_TEXT: Readonly<Record<BattleTutorialStep, string>> = {
  1: "まずは、今の症状を再現してみましょう。枠で光っている「再現手順」ボタンを押してください",
  2: "再現できました。次は枠で光っている「ログ確認」を押して、バグの候補を絞りましょう",
  3: "最後は修正です。症状に合う種類を選んで、枠で光っている「修正パッチ」を当てましょう",
};

/** ③ で修正パッチがまだ当てられない理由。画面が legalActions の結果から渡す。 */
export type PatchBlocked = "cpu" | "reproduce" | null;

/** ③ なのにパッチが当てられないとき（CPU 不足・未再現）の案内。行き止まりにしない。 */
export const BATTLE_TUTORIAL_BLOCKED_TEXT = {
  cpu: "CPU が足りません。枠で光っている「ターン終了」で CPU を回復してから、「修正パッチ」を当てましょう",
  reproduce: "修正の前に、もう一度枠で光っている「再現手順」を押して、症状を再現しましょう",
} as const;

export interface BattleTutorialView {
  readonly step: BattleTutorialStep;
  readonly text: string;
  /** 強調するボタン。skill は SkillId、endTurn は「ターン終了」。 */
  readonly target: "reproduce" | "read-log" | "patch" | "endTurn";
}

const TARGETS = { 1: "reproduce", 2: "read-log", 3: "patch" } as const;

function has(storage: KeyValueStorage, key: string): boolean {
  const r = new SaveStore<unknown>(storage, key, FLAG_VERSION).load();
  // 未保存以外（保存済み・破損・バージョン違い）はすべて「見た」扱い
  return !(!r.ok && r.reason === "missing");
}

/** 3つのキーがどれも未保存のときだけ true。破損・未知の値・ストレージ例外は「出さない」側に倒す。 */
export function shouldShowBattleTutorial(storage: KeyValueStorage): boolean {
  try {
    return ![BATTLE_TUTORIAL_COMPLETE_KEY, BATTLE_TUTORIAL_SKIPPED_KEY, LEGACY_KEY].some((k) =>
      has(storage, k),
    );
  } catch {
    return false;
  }
}

export interface BattleTutorialOptions {
  /** `?seed=`（QA フック）で起動したか。true の間は出さず、フラグも書かない（force を除く）。 */
  readonly qaSeed: boolean;
  /** `?tutorial=battle` の明示指定。保存済みでも出し、フラグは書かない。 */
  readonly force?: boolean;
}

export class BattleTutorial {
  private running = false;
  private step: BattleTutorialStep = 1;
  /** 現ステップに入ったときの s.stats.turns（スキル使用ではターンが進まないので、観測回数でなくターン差で数える）。 */
  private stepTurns = 0;
  /** ② に入ったときの候補数。これより減れば ② 完了。 */
  private candidatesAtStep2 = 0;
  /** この画面を開いている間に一度終わったか（force のときフラグが無いので、同じ読み込み中の再発火を止める）。 */
  private ended = false;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly opts: BattleTutorialOptions,
  ) {}

  get active(): boolean {
    return this.running;
  }

  private get persists(): boolean {
    return !this.opts.force;
  }

  /** 戦闘画面に入るたびに呼ぶ。1階・戦闘中・未保存のときだけ始める（再入室では続きから）。 */
  start(s: RunState): void {
    if (this.running || this.ended) return;
    if (this.opts.qaSeed && !this.opts.force) return;
    if (s.floor.number !== 1 || s.phase !== "battle" || !s.battle) return;
    if (!this.opts.force && !shouldShowBattleTutorial(this.storage)) return;
    this.running = true;
    this.step = 1;
    this.stepTurns = s.stats.turns;
    // 再現済み・候補が1つなどで始まった場合は、済んでいる分を飛ばす
    this.settle(s);
  }

  /** 今の案内。終わっていれば null。 */
  view(blocked: PatchBlocked = null): BattleTutorialView | null {
    if (!this.running) return null;
    if (this.step === 3 && blocked) {
      return {
        step: 3,
        text: BATTLE_TUTORIAL_BLOCKED_TEXT[blocked],
        target: blocked === "cpu" ? "endTurn" : "reproduce",
      };
    }
    return { step: this.step, text: BATTLE_TUTORIAL_TEXT[this.step], target: TARGETS[this.step] };
  }

  /** 操作のあと（再描画の前）に最新の状態を渡す。 */
  observe(s: RunState): void {
    if (!this.running) return;
    if (s.phase !== "battle" || !s.battle) {
      this.finish("complete");
      return;
    }
    this.settle(s);
  }

  /** 条件を満たしたステップを順に進める（1回の操作で2段進むこともある）。 */
  private settle(s: RunState): void {
    const b = s.battle;
    if (!b) return;
    for (;;) {
      const timedOut = s.stats.turns - this.stepTurns >= TIMEOUT_TURNS;
      if (this.step === 1 && (b.reproduced || timedOut)) {
        this.enter(2, s);
      } else if (
        this.step === 2 &&
        (b.candidates.length < this.candidatesAtStep2 || b.candidates.length <= 1 || timedOut)
      ) {
        this.enter(3, s);
      } else {
        return;
      }
    }
  }

  private enter(step: BattleTutorialStep, s: RunState): void {
    this.step = step;
    this.stepTurns = s.stats.turns;
    this.candidatesAtStep2 = s.battle?.candidates.length ?? 0;
  }

  skip(): void {
    if (this.running) this.finish("skipped");
  }

  private finish(how: "complete" | "skipped"): void {
    this.running = false;
    this.ended = true;
    if (!this.persists) return;
    try {
      const key = how === "complete" ? BATTLE_TUTORIAL_COMPLETE_KEY : BATTLE_TUTORIAL_SKIPPED_KEY;
      new SaveStore<string>(this.storage, key, FLAG_VERSION).save("1");
    } catch {
      // 保存できなくても案内は閉じる
    }
  }
}

let shared: BattleTutorial | null = null;

/** アプリ全体で1つ。`?seed=` / `?tutorial=battle` の有無はここで決める。 */
export function battleTutorial(opts: BattleTutorialOptions): BattleTutorial {
  if (!shared) {
    let storage: KeyValueStorage;
    try {
      storage = localStorage;
    } catch {
      storage = { getItem: () => "unreadable", setItem: () => {}, removeItem: () => {} };
    }
    shared = new BattleTutorial(storage, opts);
  }
  return shared;
}
