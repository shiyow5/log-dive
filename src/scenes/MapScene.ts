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
  roomLabelText,
  PORTRAIT_AVAIL_H,
  PORTRAIT_ID_FONT_PX,
  isShownOnMap,
  ID_FONT_PX,
  UNKNOWN_H,
  roomSymbol,
  stairsOpen,
  symbolColor,
  COLORS,
  MAP_SHAPE_COLORS,
} from "./map-symbols";

/** "#rrggbb" → Phaser の数値色。 */
const num = (hex: string): number => Number.parseInt(hex.slice(1), 16);

// 記号色は COLORS（map-symbols.ts）から作る。二重定義しない。
const COLOR = {
  // #89 minori 指定（背景 #0f1a1c 比）: 接続線・未踏枠 #5a7a80 = 3.82:1、訪問済み枠 #8fa9a3 = 7.07:1。
  // 訪問済みの塗り #33494e は単体で 3:1 に届かないため、非文字 3:1 は枠線で満たす。
  bg: num(COLORS.bg),
  line: num(MAP_SHAPE_COLORS.line),
  unknownEdge: num(MAP_SHAPE_COLORS.line),
  visitedFill: num(MAP_SHAPE_COLORS.visitedFill),
  visitedEdge: num(MAP_SHAPE_COLORS.visitedEdge),
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

/** 現在地 a から見た b の向き（マップ上の位置との対応用）。y は下向きが正。 */
function direction(a: RoomState, b: RoomState): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "→右" : dx < 0 ? "←左" : "";
  return dy > 0 ? "↓下" : "↑上";
}

/**
 * 移動ボタンの文言（＝読み上げ名）。部屋 id（r0, r1 …）は未踏でも出す。
 * Playwright では getByRole("button", { name: /r1へ移動/ }) で取れる。
 */
export function moveLabel(r: RoomState, s: RunState): string {
  // 部屋 ID はマップ上に出さないので、ボタンには現在地から見た向きを添える（#114）
  const here = s.floor.rooms.find((x) => x.id === s.roomId);
  const dir = here ? direction(here, r) : "";
  if (!r.visited) return `${r.id}へ移動（未踏${dir ? `・${dir}` : ""}）`;
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
  if (dir) suffixes.push(dir);
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
    // 端末を回したとき（縦横でマップの大きさが変わる）に描き直す
    const mq = window.matchMedia("(max-aspect-ratio: 1/1)");
    const onTurn = (): void => this.redrawMap();
    mq.addEventListener("change", onTurn);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => mq.removeEventListener("change", onTurn));
  }

  private redrawMap(): void {
    this.clearMapObjects();
    this.drawMap(current());
  }

  /** 演出レイヤー(fx-*)は消さずに、マップの描画物だけ消す。 */
  private clearMapObjects(): void {
    for (const o of [...this.children.list]) {
      if (!(o instanceof Phaser.GameObjects.Image && o.texture.key.startsWith("fx-"))) o.destroy();
    }
  }

  private act(a: Action): void {
    const next = dispatch(a);
    const to = sceneFor(next);
    if (to !== "map") {
      goTo(this, to);
      return;
    }
    this.fx?.emitRunEvents(next.events);
    this.clearMapObjects();
    this.drawMap(next);
    this.renderHud(next);
  }

  private drawMap(s: RunState): void {
    const rooms = s.floor.rooms;
    const visible = rooms.filter((r) => isShownOnMap(r, s));
    // 縦持ち（aspect<1）は HUD が canvas の下なので、マップに全高を使う（#114）
    const portrait = window.matchMedia("(max-aspect-ratio: 1/1)").matches;
    const layout = calcMapLayout(rooms, portrait ? { availH: PORTRAIT_AVAIL_H } : undefined);
    const { CELL, ROOM, ORIGIN_X, ORIGIN_Y } = layout;
    const dense = isDense(layout);

    function center(r: RoomState): { x: number; y: number } {
      return { x: ORIGIN_X + r.x * CELL, y: ORIGIN_Y + r.y * CELL };
    }

    const g = this.add.graphics();
    g.lineStyle(1, COLOR.line, 1);
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
      // 未踏は塗りなし＋1px の #5a7a80 枠、訪問済みは #33494e 塗り＋1px の #8fa9a3 枠（#89）
      // 未踏の内側は背景色で抜く（塗りなし扱い。接続線が箱の中の「?」に重ならないようにする）
      g.fillStyle(isHere ? COLOR.currentFill : r.visited ? COLOR.visitedFill : COLOR.bg, 1);
      g.fillRect(x - ROOM / 2, y - ROOM / 2, ROOM, ROOM);
      g.lineStyle(1, r.visited || isHere ? COLOR.visitedEdge : COLOR.unknownEdge, 1);
      g.strokeRect(x - ROOM / 2, y - ROOM / 2, ROOM, ROOM);
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
      // 未踏は「?」を箱の中央に置く（#114。部屋 ID は出さない）
      // 開いた階段の ▼ など記号が出ている未踏部屋には「?」を重ねない
      if (!r.visited && !dense && !(sym && symbolFits(layout))) {
        this.add
          .text(x, y, "?", {
            fontFamily: FONT_FAMILY,
            fontSize: `${UNKNOWN_H}px`,
            color: COLOR.weak,
          })
          .setOrigin(0.5, 0.5)
          .setResolution(RENDER_SCALE);
      }
      // 探索済みの部屋は関数名を箱の真下に（#114）。部屋 ID はキャンバスに出さない。未踏は上の「?」。
      const label = roomLabelText(r, layout);
      if (label) {
        this.add
          .text(x, y + ROOM / 2 - 2, label, {
            fontFamily: FONT_FAMILY,
            fontSize: `${portrait ? PORTRAIT_ID_FONT_PX : ID_FONT_PX}px`,
            color: isHere ? COLOR.text : COLOR.weak,
            stroke: "#0f1a1c",
            strokeThickness: 1,
          })
          .setOrigin(0.5, 0)
          .setResolution(RENDER_SCALE);
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
        { class: "hud-row hud-row--danger" },
        abandonButton(() => this.act({ t: "abandon" })),
      ),
      logLine(s),
    );
    renderHud("map", panel);
  }
}
