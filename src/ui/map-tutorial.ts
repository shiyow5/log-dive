/**
 * マップのチュートリアル（Issue #64 PR-1）。画面（Phaser/DOM）に依存しない状態機械。
 *
 * 流れ: 1 移動 → 2 戦闘に入る → 3 宝箱 → 4 階段。各ステップは RunState の変化（moved / battle /
 * looted / descended）で進む。戦闘中は一時停止し、マップに戻ったら続きから再開する（#59 なしで動く）。
 * 完了・スキップは保存フラグ `tutorial.map` に残し、2回目以降は出さない。
 */
import { flags } from "./flags";
import { SaveStore, type KeyValueStorage } from "../core/save";
import { stairsOpen, type RoomState, type RunState } from "../scenes/run-port";

/** 保存フラグのキー。既存の save（SaveStore）と同じ仕組みで、キーだけ別。 */
export const TUTORIAL_KEY = "tutorial.map";
const FLAG_VERSION = 1;
/** ステップ3の詰まり回避: 宝箱の部屋が出ないまま、これだけ部屋を移動したら完了扱い。 */
export const STUCK_ROOMS = 3;
export const TOTAL_STEPS = 4;

export type TutorialStep = 1 | 2 | 3 | 4;

/** 強調する対象。move は部屋 id のボタン、chest は宝箱ボタン、none は強調なし。 */
export type TutorialTarget =
  | { readonly kind: "move"; readonly rooms: readonly string[] }
  | { readonly kind: "chest" }
  | { readonly kind: "none" };

export interface TutorialView {
  readonly step: TutorialStep;
  readonly total: number;
  readonly text: string;
  readonly target: TutorialTarget;
}

/**
 * 保存フラグを読んで、案内を出してよいか返す。
 * 未保存のときだけ出す。破損・未知の値・バージョン違い・ストレージ例外は「出さない」側に倒す。
 */
export function shouldShowTutorial(storage: KeyValueStorage): boolean {
  try {
    const r = new SaveStore<unknown>(storage, TUTORIAL_KEY, FLAG_VERSION).load();
    return !r.ok && r.reason === "missing";
  } catch {
    return false;
  }
}

/** 現在地から目的の部屋への最短経路の「次の一歩」（部屋 id）。経路が無ければ null。 */
function nextHop(s: RunState, goal: (r: RoomState) => boolean): string | null {
  const rooms = new Map(s.floor.rooms.map((r) => [r.id, r]));
  const first = new Map<string, string>();
  const queue: string[] = [s.roomId];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const room = rooms.get(id);
    if (!room) continue;
    for (const n of room.neighbors) {
      if (seen.has(n)) continue;
      seen.add(n);
      first.set(n, id === s.roomId ? n : (first.get(id) as string));
      const nr = rooms.get(n);
      if (nr && goal(nr)) return first.get(n) ?? null;
      queue.push(n);
    }
  }
  return null;
}

export class MapTutorial {
  private running = false;
  private step: TutorialStep = 1;
  private paused = false;
  private movesInStep3 = 0;
  private chestSeen = false;

  constructor(
    private readonly storage: KeyValueStorage,
    /** `?seed=`（QA フック）で起動したか。true の間は出さず、フラグも書かない。 */
    private readonly qaSeed: boolean,
  ) {}

  /** 案内の最中か（一時停止中も true）。 */
  get active(): boolean {
    return this.running;
  }

  /** 戦闘中などで一時停止しているか。 */
  get isPaused(): boolean {
    return this.paused;
  }

  get currentStep(): TutorialStep {
    return this.step;
  }

  /** ランの開始時に呼ぶ。初回（未保存）・1階・非 QA のときだけ案内を始める。 */
  start(s: RunState): void {
    this.running = false;
    this.step = 1;
    this.paused = false;
    this.movesInStep3 = 0;
    this.chestSeen = false;
    if (this.qaSeed) return;
    if (s.floor.number !== 1 || s.phase !== "map") return;
    if (!shouldShowTutorial(this.storage)) return;
    this.running = true;
  }

  /** 操作のあと（と、マップに戻ったとき）に最新の状態を渡す。 */
  observe(s: RunState): void {
    if (!this.running) return;
    if (s.phase === "won" || s.phase === "lost" || s.phase === "abandoned") {
      // 最後まで見ないままラン終了。保存せず終わる（次のランでもう一度出る）
      this.running = false;
      return;
    }
    if (s.events.some((e) => e.t === "descended")) {
      this.finish();
      return;
    }
    if (s.phase === "battle") {
      // 戦闘に入った: ステップ1/2 は済み。ここから先の案内は #59 に任せ、一時停止する
      this.paused = true;
      if (this.step < 3) this.enter(3);
      return;
    }
    this.paused = false;
    if (s.events.some((e) => e.t === "looted")) {
      if (this.step < 4) this.enter(4);
      return;
    }
    const moved = s.events.some((e) => e.t === "moved");
    if (!moved) return;
    if (this.step === 1) {
      this.enter(2);
    } else if (this.step === 3) {
      this.movesInStep3 += 1;
      if (s.floor.rooms.find((r) => r.id === s.roomId)?.content.kind === "chest") {
        this.chestSeen = true;
      }
      // 宝箱の部屋が出ないまま何部屋も歩いたら、詰まらないように完了扱いにして階段へ
      if (!this.chestSeen && this.movesInStep3 >= STUCK_ROOMS) this.enter(4);
    }
  }

  /** スキップ（いつでも終了）。フラグを保存して二度と出さない。 */
  skip(): void {
    if (this.running) this.finish();
  }

  /** いま出す案内。出さないとき（非アクティブ・一時停止中）は null。 */
  view(s: RunState): TutorialView | null {
    if (!this.running || this.paused || s.phase !== "map") return null;
    const here = s.floor.rooms.find((r) => r.id === s.roomId);
    const neighbors = (here?.neighbors ?? [])
      .map((id) => s.floor.rooms.find((r) => r.id === id))
      .filter((r): r is RoomState => r !== undefined);
    const all = neighbors.map((r) => r.id);
    const base = { step: this.step, total: TOTAL_STEPS };
    switch (this.step) {
      case 1:
        return {
          ...base,
          text: "隣の部屋へ移動してみよう",
          target: { kind: "move", rooms: all },
        };
      case 2: {
        const bugs = neighbors
          .filter((r) => r.visited && r.content.kind === "bug")
          .map((r) => r.id);
        return {
          ...base,
          text: "バグのいる部屋に入ると、戦闘が始まる",
          target: { kind: "move", rooms: bugs.length > 0 ? bugs : all },
        };
      }
      case 3:
        return here?.content.kind === "chest"
          ? { ...base, text: "宝箱を開けて、スキルを手に入れよう", target: { kind: "chest" } }
          : { ...base, text: "宝箱の部屋を探して、スキルを手に入れよう", target: { kind: "none" } };
      case 4: {
        if (!s.floor.rooms.some((r) => r.content.kind === "stairs") || !stairsOpen(s)) {
          return { ...base, text: "バグを全部閉じると、階段が開く", target: { kind: "none" } };
        }
        const hop = nextHop(s, (r) => r.content.kind === "stairs");
        return {
          ...base,
          text: "階段が開いた。階段の部屋へ進もう",
          target: hop ? { kind: "move", rooms: [hop] } : { kind: "none" },
        };
      }
    }
  }

  private enter(step: TutorialStep): void {
    this.step = step;
    if (step === 3) {
      this.movesInStep3 = 0;
      this.chestSeen = false;
    }
  }

  private finish(): void {
    this.running = false;
    if (this.qaSeed) return;
    try {
      new SaveStore<string>(this.storage, TUTORIAL_KEY, FLAG_VERSION).save("done");
    } catch {
      // 保存できなくても遊びは止めない
    }
  }
}

let shared: MapTutorial | null = null;

/** アプリ全体で1つ。`?seed=` の有無はここで決める。 */
export function mapTutorial(): MapTutorial {
  if (!shared) {
    let storage: KeyValueStorage;
    try {
      storage = localStorage;
    } catch {
      // localStorage に触れない環境は出さない側（読めないので常に「保存済み」扱い）
      storage = { getItem: () => "unreadable", setItem: () => {}, removeItem: () => {} };
    }
    shared = new MapTutorial(storage, flags().seed !== null);
  }
  return shared;
}
