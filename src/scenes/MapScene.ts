import Phaser from "phaser";
import { setupView } from "./view";
import { FONT_FAMILY, RENDER_SCALE } from "../config";
import { createSceneFx } from "../fx/scene-fx";
import type { FxDirector } from "../fx/FxDirector";
import { button, el, renderHud } from "../ui/hud";
import { abandonButton, logLine, statsRow } from "./hud-parts";
import { apply, current, dispatch, legality, sceneFor, skillInfo } from "./run-port";
import type { Action, RoomState, RunState } from "./run-port";
import { fadeIn, goTo } from "./transition";
import {
  calcMapLayout,
  isDense,
  symbolFits,
  roomIdText,
  isShownOnMap,
  ID_FONT_PX,
  UNKNOWN_OFFSET,
  UNKNOWN_H,
  roomSymbol,
  stairsOpen,
  symbolColor,
  COLORS,
} from "./map-symbols";

/** "#rrggbb" → Phaser の数値色。 */
const num = (hex: string): number => Number.parseInt(hex.slice(1), 16);

// 記号色は COLORS（map-symbols.ts）から作る。二重定義しない。
const COLOR = {
  line: 0x26393d,
  unknown: 0x26393d,
  visited: 0x1b2b2e,
  current: num(COLORS.hint),
  // 現在地の箱の塗り（暗い金）。宝箱の金枠と同じ枠でも、塗りで現在地と区別できるようにする
  currentFill: 0x4a3f1c,
  bug: num(COLORS.bug),
  chest: num(COLORS.hint),
  stairs: num(COLORS.stairs),
  boss: num(COLORS.boss),
  text: COLORS.visited,
  weak: "#8fa9a3",
};

/**
 * 移動ボタンの文言（＝読み上げ名）。部屋 id（r0, r1 …）は未踏でも出す。
 * Playwright では getByRole("button", { name: /r1へ移動/ }) で取れる。
 */
export function moveLabel(r: RoomState, s: RunState): string {
  if (!r.visited) return `${r.id}へ移動（未踏）`;
  const suffixes: string[] = [];
  if (r.content.kind === "stairs" && stairsOpen(s)) {
    suffixes.push("階段・開いている");
  }
  if (r.content.kind === "chest") {
    suffixes.push("宝箱あり");
  }
  if (r.content.kind === "bug" && r.content.bugs.length > 0) {
    suffixes.push("バグあり");
  }
  const suffix = suffixes.length > 0 ? `（${suffixes.join("・")}）` : "";
  return `${r.id}へ移動: ${r.label}${suffix}`;
}

export class MapScene extends Phaser.Scene {
  private fx?: FxDirector;

  constructor() {
    super("map");
  }

  create(): void {
    setupView(this);
    fadeIn(this);
    const s = current();
    const fx = createSceneFx(this, "fx-map");
    this.fx = fx;
    fx.emit("mapAmbient");
    fx.emitRunEvents(s.events);
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
    this.fx?.emitRunEvents(next.events);
    // 演出レイヤー(fx-*)は消さずに、マップの描画物だけ作り直す
    for (const o of [...this.children.list]) {
      if (!(o instanceof Phaser.GameObjects.Image && o.texture.key.startsWith("fx-"))) o.destroy();
    }
    this.drawMap(next);
    this.renderHud(next);
  }

  private drawMap(s: RunState): void {
    const rooms = s.floor.rooms;
    const visible = rooms.filter((r) => isShownOnMap(r, s));
    const layout = calcMapLayout(rooms);
    const { CELL, ROOM, ORIGIN_X, ORIGIN_Y } = layout;
    const dense = isDense(layout);

    function center(r: RoomState): { x: number; y: number } {
      return { x: ORIGIN_X + r.x * CELL, y: ORIGIN_Y + r.y * CELL };
    }

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
      g.fillStyle(isHere ? COLOR.currentFill : r.visited ? COLOR.visited : COLOR.unknown, 1);
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
      if (r.content.kind === "stairs" && (r.visited || stairsOpen(s))) {
        g.lineStyle(2, COLOR.stairs, 1);
        g.strokeRect(x - ROOM / 2, y - ROOM / 2, ROOM, ROOM);
      }
      // 記号（未踏は出さない。ただし開いた階段の ▼ は出す。判定は roomSymbol）
      const sym = roomSymbol(r, s);
      if (sym && symbolFits(layout)) {
        // 密な階は箱の右隣（上下に余白がなく隣の部屋と重なるため）
        const symPos = dense
          ? { x: x + ROOM / 2 + 1, y, ox: 0, oy: 0.5, px: "7px" }
          : { x, y, ox: 0.5, oy: 0.5, px: "10px" };
        this.add
          .text(symPos.x, symPos.y, sym, {
            fontFamily: FONT_FAMILY,
            fontSize: symPos.px,
            color: symbolColor(r),
          })
          .setOrigin(symPos.ox, symPos.oy)
          .setResolution(RENDER_SCALE);
      }
      // 現在地: 2px の黄色い枠 + 中央に 4×4 の塗り（「@」は使わない。#88）。中央に ID（密な階）や記号があるときは枠だけ
      if (isHere) {
        g.lineStyle(2, COLOR.current, 1);
        g.strokeRect(x - ROOM / 2, y - ROOM / 2, ROOM, ROOM);
        if (!dense && !sym) {
          g.fillStyle(COLOR.current, 1);
          g.fillRect(x - 2, y - 2, 4, 4);
        }
      }
      // 未踏は「?」を右上角に固定オフセットで置く（接続線は辺の中央から出るので重ならない）
      if (!r.visited && !dense) {
        this.add
          .text(x + ROOM / 2 + UNKNOWN_OFFSET.x, y - ROOM / 2 + UNKNOWN_OFFSET.y, "?", {
            fontFamily: FONT_FAMILY,
            fontSize: `${UNKNOWN_H}px`,
            color: COLOR.weak,
          })
          .setOrigin(0, 1)
          .setResolution(RENDER_SCALE);
      }
      // 部屋 ID（移動ボタンとの対応用）。部屋名はキャンバスに出さない（現在地・名前は HUD に任せる）。
      // 疎な階は箱の外左下、密な階は箱の中央（数字のみ）。内部 10px 以上。
      this.add
        .text(dense ? x : x - ROOM / 2, dense ? y : y + ROOM / 2 - 2, roomIdText(r.id, layout), {
          fontFamily: FONT_FAMILY,
          fontSize: `${ID_FONT_PX}px`,
          color: dense ? (r.visited ? COLOR.text : COLOR.weak) : isHere ? COLOR.text : COLOR.weak,
          stroke: "#0f1a1c",
          strokeThickness: dense ? 0 : 1,
        })
        .setOrigin(dense ? 0.5 : 0, dense ? 0.5 : 0)
        .setResolution(RENDER_SCALE);
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

    // 宝箱が disabled の場合のエラーメッセージ
    const chestMsg = (() => {
      if (here?.content.kind !== "chest") return null;
      if (legal.can({ t: "loot", pick: here.content.skill })) return null;
      const next = apply(s, { t: "loot", pick: here.content.skill });
      return next.lastError?.message ?? null;
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
            return button(moveLabel(r, s), () => this.act(a), { disabled: !legal.can(a) });
          }),
        ),
      ),
      el("div", { class: "hud-row" }, ...(chestBtn ? [chestBtn] : [])),
      ...(chestMsg
        ? [
            el(
              "div",
              { class: "hud-row" },
              el(
                "span",
                { style: "color: #ff6b5e; font-size: 12px;", "aria-live": "polite" },
                chestMsg,
              ),
            ),
          ]
        : []),
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
