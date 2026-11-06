import Phaser from "phaser";
import { button, el, renderHud } from "../ui/hud";
import { abandonButton, logLine, statsRow } from "./hud-parts";
import { current, dispatch, legality, sceneFor, stairsOpen, skillInfo } from "./run-port";
import type { Action, RoomState, RunState } from "./run-port";
import { fadeIn, goTo } from "./transition";

const CELL = 32;
const ORIGIN_X = 96;
const ORIGIN_Y = 20;
const ROOM = 20;

const COLOR = {
  line: 0x26393d,
  unknown: 0x26393d,
  visited: 0x1b2b2e,
  current: 0x7ebeab,
  bug: 0xff6b5e,
  chest: 0xf0c040,
  stairs: 0x88c0d0,
  boss: 0xb48ead,
  text: "#e4f1ec",
  weak: "#8fa9a3",
};

function center(r: RoomState): { x: number; y: number } {
  return { x: ORIGIN_X + r.x * CELL, y: ORIGIN_Y + r.y * CELL };
}

/** 部屋の名前。未踏なら「?」（spec-a v0.2 §9: 未訪問は隣接のみ ? 表示）。 */
export function roomName(r: RoomState): string {
  return r.visited ? r.label : "?";
}

/**
 * 移動ボタンの文言（＝読み上げ名）。部屋 id（r0, r1 …）は未踏でも出す。
 * Playwright では getByRole("button", { name: /r1へ移動/ }) で取れる。
 */
export function moveLabel(r: RoomState): string {
  return r.visited ? `${r.id}へ移動: ${r.label}` : `${r.id}へ移動（未踏）`;
}

/** 部屋の内容に応じた記号（色だけに頼らない）。 */
function roomSymbol(r: RoomState, s: RunState): string | null {
  const c = r.content;
  if (c.kind === "stairs") {
    return s.roomId === r.id && stairsOpen(s) ? "▼" : "◆";
  }
  if (c.kind === "chest") {
    return "♦";
  }
  if (c.kind === "bug") {
    // ボス部屋は▲、バグ部屋は×（閉じた部屋には出ない）
    if (c.boss) {
      return c.bugs.length > 0 ? "▲" : "★";
    }
    return c.bugs.length > 0 ? "×" : "✓";
  }
  return null;
}

/** 記号の色。 */
function symbolColor(r: RoomState): string {
  const c = r.content;
  if (c.kind === "chest") return "#f0c040";
  if (c.kind === "stairs") return "#88c0d0";
  if (c.kind === "bug") return c.boss ? "#b48ead" : "#ff6b5e";
  return COLOR.text;
}

export class MapScene extends Phaser.Scene {
  constructor() {
    super("map");
  }

  create(): void {
    fadeIn(this);
    const s = current();
    this.drawMap(s);
    this.renderHud(s);
  }

  private act(a: Action): void {
    const next = dispatch(a);
    const to = sceneFor(next);
    if (to !== "map") {
      goTo(this, to);
      return;
    }
    this.children.removeAll(true);
    this.drawMap(next);
    this.renderHud(next);
  }

  private drawMap(s: RunState): void {
    const rooms = s.floor.rooms;
    const here = rooms.find((r) => r.id === s.roomId);
    const visible = rooms.filter((r) => r.visited || (here?.neighbors.includes(r.id) ?? false));
    const g = this.add.graphics();
    g.lineStyle(2, COLOR.line, 1);
    for (const r of visible) {
      for (const id of r.neighbors) {
        const o = visible.find((v) => v.id === id);
        if (!o || o.id < r.id) continue;
        const a = center(r);
        const b = center(o);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    for (const r of visible) {
      const { x, y } = center(r);
      const isHere = r.id === s.roomId;
      g.fillStyle(isHere ? COLOR.current : r.visited ? COLOR.visited : COLOR.unknown, 1);
      g.fillRect(x - ROOM / 2, y - ROOM / 2, ROOM, ROOM);
      // バグ部屋は「警告色の枠＋記号」（色だけに頼らない）
      if (r.visited && r.content.kind === "bug") {
        g.lineStyle(2, COLOR.bug, 1);
        g.strokeRect(x - ROOM / 2, y - ROOM / 2, ROOM, ROOM);
      }
      // 宝箱部屋は金色の枠
      if (r.visited && r.content.kind === "chest") {
        g.lineStyle(2, COLOR.chest, 1);
        g.strokeRect(x - ROOM / 2, y - ROOM / 2, ROOM, ROOM);
      }
      // 階段部屋は階段色の枠
      if (r.visited && r.content.kind === "stairs") {
        g.lineStyle(2, COLOR.stairs, 1);
        g.strokeRect(x - ROOM / 2, y - ROOM / 2, ROOM, ROOM);
      }
      // 記号
      const sym = roomSymbol(r, s);
      if (sym) {
        this.add
          .text(x, y - ROOM / 2 - 2, sym, {
            fontFamily: "monospace",
            fontSize: "10px",
            color: symbolColor(r),
          })
          .setOrigin(0.5, 0);
      }
      this.add
        .text(x, y + ROOM / 2 + 2, roomName(r), {
          fontFamily: "monospace",
          fontSize: "8px",
          color: r.visited ? COLOR.text : COLOR.weak,
        })
        .setOrigin(0.5, 0);
      if (isHere) {
        this.add
          .text(x, y, "@", { fontFamily: "monospace", fontSize: "12px", color: "#0f1a1c" })
          .setOrigin(0.5);
      }
    }
  }

  private renderHud(s: RunState): void {
    const here = s.floor.rooms.find((r) => r.id === s.roomId);
    const neighbors = (here?.neighbors ?? [])
      .map((id) => s.floor.rooms.find((r) => r.id === id))
      .filter((r): r is RoomState => r !== undefined);
    const legal = legality(s);

    // 宝箱ボタンの生成
    const chestBtn = (() => {
      if (here?.content.kind !== "chest") return null;
      const skill = here.content.skill;
      const name = skillInfo(skill).name;
      const a: Action = { t: "loot", pick: skill };
      return button(`宝箱を開ける: ${name}`, () => this.act(a), {
        disabled: !legal.can(a),
      });
    })();

    // 階段ボタンの生成（訪問済みで階段が開いている場合）
    const stairsBtn = (() => {
      if (!here || here.content.kind !== "stairs") return null;
      if (!stairsOpen(s)) return null;
      const nextFloor = s.floor.number + 1;
      return button(
        `次の階へ降りる（${nextFloor}階）`,
        () => {
          // core 側で applyMove を階段部屋に対して呼び出すと descended イベントが出る
          this.act({ t: "move", room: here.id });
        },
        { primary: true },
      );
    })();

    const panel = el(
      "section",
      { class: "hud-panel", "aria-label": "マップ" },
      el("h2", {}, `現在地: ${here?.label ?? "?"}`),
      statsRow(s),
      el(
        "nav",
        { "aria-label": "隣の部屋" },
        el("h3", {}, "隣の部屋"),
        el(
          "div",
          { class: "hud-row" },
          ...neighbors.map((r) => {
            const a: Action = { t: "move", room: r.id };
            return button(moveLabel(r), () => this.act(a), { disabled: !legal.can(a) });
          }),
        ),
      ),
      el(
        "div",
        { class: "hud-row" },
        ...(chestBtn ? [chestBtn] : []),
        ...(stairsBtn ? [stairsBtn] : []),
      ),
      el(
        "div",
        { class: "hud-row" },
        abandonButton(() => this.act({ t: "abandon" })),
      ),
      logLine(s),
    );
    renderHud("map", panel);
  }
}
