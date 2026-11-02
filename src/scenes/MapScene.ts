import Phaser from "phaser";
import { button, el, renderHud } from "../ui/hud";
import { abandonButton, logLine, statsRow } from "./hud-parts";
import { current, dispatch, legality, sceneFor } from "./run-port";
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
        abandonButton(() => this.act({ t: "abandon" })),
      ),
      logLine(s),
    );
    renderHud("map", panel);
  }
}
