/**
 * 画面の骨組み用の「仮の」RunState / Action とスタブ reducer。
 *
 * - shingo の S1（src/core/run.ts の RunState / Action 型）と S2（apply()）が main に入ったら、
 *   このファイルは消して src/scenes/run-port.ts の import 先を core に差し替える（K3）。
 * - 形は spec-a-mvp.md §6 と spec-a-mvp-v0.2 の決定に合わせてある（名前が違えば K3 で寄せる）。
 * - 中身はわざと小さい: 3部屋・バグ1体（off-by-one）・スキル4枚だけ。数値もここに直書きしている
 *   （本物は src/data/*.json。スタブなので core のルールの対象外）。
 */

export type SkillId = "reproduce" | "read-log" | "hotfix" | "patch" | "breakpoint" | "bisect";
export type BugKind = "off-by-one" | "null-ref" | "race" | "leak" | "infinite-loop";

export type Action =
  | { t: "move"; room: number }
  | { t: "skill"; id: SkillId; arg?: BugKind }
  | { t: "endTurn" }
  | { t: "loot"; pick: SkillId }
  | { t: "abandon" };

export interface Room {
  id: number;
  /** 現在地ラベル（例: auth.login()） */
  label: string;
  /** 小グリッド上の位置（Map の描画用） */
  x: number;
  y: number;
  links: number[];
  /** この部屋のバグ（閉じたら undefined） */
  bug?: BugKind;
}

export interface BattleState {
  kind: BugKind;
  hp: number;
  maxHp: number;
  reproduced: boolean;
  /** 残っている候補（patch で選べるのはここにあるものだけ） */
  candidates: BugKind[];
  /** 公開済みの症状 */
  symptoms: string[];
  /** 次の行動の予告 */
  intent: { damage: number };
}

export type RunStatus = "map" | "battle" | "won" | "lost" | "abandoned";

export interface RunState {
  seed: string;
  floor: number;
  rooms: Room[];
  current: number;
  visited: number[];
  hp: number;
  maxHp: number;
  cpu: number;
  maxCpu: number;
  turn: number;
  battle: BattleState | null;
  status: RunStatus;
  closedBugs: number;
  degrades: number;
  lastError: string | null;
  /** 直前の操作で起きたこと（画面のログ・読み上げ用） */
  lastEvent: string | null;
}

export const SKILL_COST: Record<"reproduce" | "read-log" | "hotfix" | "patch", number> = {
  reproduce: 1,
  "read-log": 1,
  hotfix: 1,
  patch: 2,
};

export const BUG_NAME: Record<BugKind, string> = {
  "off-by-one": "境界ずれ",
  "null-ref": "ヌル参照",
  race: "競合状態",
  leak: "メモリリーク",
  "infinite-loop": "無限ループ",
};

const SYMPTOMS: Partial<Record<BugKind, string[]>> = {
  "off-by-one": ["表示と1ずれる", "配列の端で落ちる", "ループが1回多い"],
};

export function createRun(seed: string): RunState {
  return {
    seed,
    floor: 1,
    rooms: [
      { id: 0, label: "main()", x: 1, y: 1, links: [1, 2] },
      { id: 1, label: "auth.login()", x: 3, y: 0, links: [0], bug: "off-by-one" },
      { id: 2, label: "cache.get()", x: 3, y: 2, links: [0] },
    ],
    current: 0,
    visited: [0],
    hp: 30,
    maxHp: 30,
    cpu: 3,
    maxCpu: 3,
    turn: 1,
    battle: null,
    status: "map",
    closedBugs: 0,
    degrades: 0,
    lastError: null,
    lastEvent: null,
  };
}

function fail(s: RunState, msg: string): RunState {
  return { ...s, lastError: msg, lastEvent: null };
}

/** 仮の reducer。不正な操作は例外にせず lastError を立てて状態を変えない（spec §6 と同じ約束）。 */
export function apply(s: RunState, a: Action): RunState {
  if (s.status === "won" || s.status === "lost" || s.status === "abandoned") {
    return fail(s, "ランは終わっています");
  }
  switch (a.t) {
    case "abandon":
      return { ...s, status: "abandoned", lastError: null, lastEvent: "ランを放棄した" };
    case "move":
      return move(s, a.room);
    case "skill":
      return skill(s, a.id, a.arg);
    case "endTurn":
      return endTurn(s);
    case "loot":
      return fail(s, "宝箱はまだありません");
  }
}

function move(s: RunState, roomId: number): RunState {
  if (s.battle) return fail(s, "戦闘中は移動できません");
  const here = s.rooms[s.current];
  const to = s.rooms[roomId];
  if (!here || !to || !here.links.includes(roomId)) return fail(s, "その部屋には行けません");
  const visited = s.visited.includes(roomId) ? s.visited : [...s.visited, roomId];
  const next: RunState = {
    ...s,
    current: roomId,
    visited,
    lastError: null,
    lastEvent: `${to.label} に移動した`,
  };
  if (!to.bug) return next;
  return {
    ...next,
    status: "battle",
    lastEvent: `${to.label} でバグが出た`,
    battle: {
      kind: to.bug,
      hp: 15,
      maxHp: 15,
      reproduced: false,
      candidates: ["off-by-one", "null-ref"],
      symptoms: [],
      intent: { damage: 2 },
    },
  };
}

function skill(s: RunState, id: SkillId, arg?: BugKind): RunState {
  const b = s.battle;
  if (!b) return fail(s, "戦闘中だけ使えます");
  if (!(id in SKILL_COST)) return fail(s, "そのスキルは持っていません");
  const cost = SKILL_COST[id as keyof typeof SKILL_COST];
  if (s.cpu < cost) return fail(s, "CPU が足りません");
  const pay = { ...s, cpu: s.cpu - cost, lastError: null };
  switch (id) {
    case "reproduce": {
      const all = SYMPTOMS[b.kind] ?? [];
      const sym = all[b.symptoms.length];
      const symptoms = sym ? [...b.symptoms, sym] : b.symptoms;
      return {
        ...pay,
        battle: { ...b, reproduced: true, symptoms },
        lastEvent: sym ? `再現した。症状「${sym}」` : "再現した（新しい症状はない）",
      };
    }
    case "read-log": {
      if (b.candidates.length <= 1) return fail(s, "候補が1つなので消せません");
      const wrong = b.candidates.find((c) => c !== b.kind);
      if (!wrong) return fail(s, "消せる候補がありません");
      return {
        ...pay,
        battle: { ...b, candidates: b.candidates.filter((c) => c !== wrong) },
        lastEvent: `ログから「${BUG_NAME[wrong]}」ではないとわかった`,
      };
    }
    case "hotfix":
      return hit({ ...pay, lastEvent: "ホットフィックスで 3 ダメージ" }, 3);
    case "patch": {
      if (!b.reproduced) return fail(s, "再現していないバグは直せません");
      if (!arg || !b.candidates.includes(arg)) return fail(s, "候補にない種類は選べません");
      if (arg === b.kind) {
        return hit({ ...pay, lastEvent: `修正パッチ命中（${BUG_NAME[arg]}）` }, 20);
      }
      return {
        ...pay,
        degrades: s.degrades + 1,
        battle: { ...b, hp: b.maxHp },
        lastEvent: `デグレ！ ${BUG_NAME[arg]} ではなかった。バグが回復した`,
      };
    }
    default:
      return fail(s, "そのスキルは持っていません");
  }
}

function hit(s: RunState, dmg: number): RunState {
  const b = s.battle;
  if (!b) return s;
  const hp = Math.max(0, b.hp - dmg);
  if (hp > 0) return { ...s, battle: { ...b, hp } };
  const rooms = s.rooms.map((r) => (r.id === s.current ? { ...r, bug: undefined } : r));
  const left = rooms.some((r) => r.bug);
  return {
    ...s,
    rooms,
    battle: null,
    closedBugs: s.closedBugs + 1,
    status: left ? "map" : "won",
    lastEvent: `${s.lastEvent ?? ""}。バグを閉じた`,
  };
}

function endTurn(s: RunState): RunState {
  const b = s.battle;
  if (!b) return fail(s, "戦闘中だけターンを終了できます");
  // off-by-one: 予告より1多いダメージ
  const dmg = b.intent.damage + 1;
  const hp = Math.max(0, s.hp - dmg);
  return {
    ...s,
    hp,
    cpu: s.maxCpu,
    turn: s.turn + 1,
    status: hp === 0 ? "lost" : s.status,
    lastError: null,
    lastEvent: `バグの攻撃で稼働率 -${dmg}`,
  };
}
