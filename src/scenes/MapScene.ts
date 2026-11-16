import Phaser from "phaser";
import { token, tokenNum } from "../ui/tokens";
import { setupView } from "./view";
import { addBackdrop, type Backdrop } from "../art/backdrop";
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from "../config";
import { createSceneFx } from "../fx/scene-fx";
import type { FxDirector } from "../fx/FxDirector";
import { button, el, renderHud, setHudBusy } from "../ui/hud";
import { fxEnabled, markFade } from "../ui/flags";
import { mapTutorial, type TutorialView } from "../ui/map-tutorial";
import { IMPACT, chestOpenFx } from "../fx/impact-fx";
import { abandonButton, logLine, statsRow } from "./hud-parts";
import { apply, current, dispatch, legality, sceneFor, skillInfo } from "./run-port";
import type { Action, RoomState, RunState } from "./run-port";
import { fadeIn, goTo } from "./transition";
import {
  calcMapLayout,
  isDense,
  symbolFits,
  roomLabelText,
  PORTRAIT_ID_FONT_PX,
  portraitCanvasH,
  isShownOnMap,
  ID_FONT_PX,
  UNKNOWN_H,
  roomSymbol,
  stairsOpen,
  symbolColor,
  COLORS,
  MAP_SHAPE_COLORS,
} from "./map-symbols";

/** 横持ちでマップの下端と HUD パネルの上端を空ける余白（内部px）。 */
const HUD_GAP = 4;

/** 部屋名ラベルの depth。pixelfx の front レイヤー(10)・宝箱(25)より手前（#115）。 */
const LABEL_DEPTH = 30;
/** 宝箱の中心の上限は「部屋中心 + 部屋の半分 - この値」。箱(16px)の下端がラベル上端(部屋下端-2px)より1px上に来る値。ラベルが箱に重なる小さい部屋だけ上にずれる。 */
const CHEST_LIFT_PX = 13;

/** "#rrggbb" → Phaser の数値色。 */
const num = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/** 宝箱の図形（#96）: 色だけに頼らず 8×8px の箱（ふた＋鍵穴）で区別する。 */
const CHEST_ICON_PX = 8;

// 記号色は COLORS（map-symbols.ts）から作る。二重定義しない。
// 値は CSS の --ld-*（tokens.ts 経由）。getter にして描画時に読む（CSS の読み込み順に依存しない）。
const COLOR = {
  get bg() {
    return tokenNum("bg");
  },
  get line() {
    return num(MAP_SHAPE_COLORS.line);
  },
  get unknownEdge() {
    return num(MAP_SHAPE_COLORS.line);
  },
  get visitedFill() {
    return num(MAP_SHAPE_COLORS.visitedFill);
  },
  get visitedEdge() {
    return num(MAP_SHAPE_COLORS.visitedEdge);
  },
  get current() {
    return num(COLORS.hint);
  },
  // 現在地の箱の塗り（暗い金）。宝箱の金枠と同じ枠でも、塗りで現在地と区別できるようにする
  get currentFill() {
    return tokenNum("current-fill");
  },
  get bug() {
    return num(COLORS.bug);
  },
  // 宝箱もヒントも同じ --ld-accent（#96）
  get chest() {
    return num(COLORS.hint);
  },
  get stairs() {
    return num(COLORS.stairs);
  },
  get boss() {
    return num(COLORS.boss);
  },
  get text() {
    return COLORS.visited;
  },
  get weak() {
    return token("border");
  },
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
  private backdrop?: Backdrop;
  /** 直近に描いたマップの部屋中心（宝箱演出の位置）。 */
  private roomCenters = new Map<string, { x: number; y: number }>();
  /** 部屋の一辺(px)。宝箱の演出位置をラベルの逆側に寄せるために使う（drawMap で更新）。 */
  private roomPx = 0;
  /** 直近に描いた縦持ちマップの描画条件（同じ階で描く行範囲が変わった再配置だけ滑らせるために使う）。 */
  private prevVert: { floor: number; rowMin: number; spanH: number; topY: number } | null = null;
  /** 再配置の滑らせ（200ms）。次の描き直しで止める。 */
  private reflowTween: Phaser.Tweens.Tween | null = null;

  constructor() {
    super("map");
  }

  create(): void {
    setupView(this);
    this.backdrop = addBackdrop(this);
    fadeIn(this);
    const s = current();
    mapTutorial().observe(s);
    const fx = createSceneFx(this, "fx-map");
    this.fx = fx;
    fx.emit("mapAmbient");
    fx.emitRunEvents(s.events);
    // HUD を先に描く（マップの下端は HUD パネルの実測位置で決まるため）
    this.renderHud(s);
    // 縦持ちは HUD の実測高さから canvas の高さを決める（HUD を描いた後でないと測れない）
    this.applyView();
    this.drawMap(s);
    // 端末を回したとき・画面サイズが変わったとき（マップの大きさや HUD の高さが変わる）に描き直す
    const mq = window.matchMedia("(max-aspect-ratio: 1/1)");
    const onTurn = (): void => {
      this.applyView();
      this.redrawMap();
    };
    mq.addEventListener("change", onTurn);
    this.scale.on(Phaser.Scale.Events.RESIZE, onTurn);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.documentElement.classList.remove("has-map-tutorial");
      mq.removeEventListener("change", onTurn);
      this.scale.off(Phaser.Scale.Events.RESIZE, onTurn);
      this.resetView();
    });
  }

  /**
   * 縦持ちのとき canvas を縦に伸ばし、HUD をその下に置く（#121）。
   * 横持ちは 320×180 のまま。canvas の内部高さが変わったときだけ作り直す（RESIZE から呼ばれても止まる）。
   */
  private applyView(): void {
    const portrait = window.matchMedia("(max-aspect-ratio: 1/1)").matches;
    if (!portrait) {
      this.resetView();
      return;
    }
    const h = portraitCanvasH(window.innerWidth, window.innerHeight, this.hudNeedH());
    if (this.scale.gameSize.height !== h * RENDER_SCALE) {
      this.scale.setGameSize(GAME_WIDTH * RENDER_SCALE, h * RENDER_SCALE);
      this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, h / 2);
      this.backdrop?.resize(h);
    }
    const cssH = this.game.canvas.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--ld-canvas-h", `${cssH}px`);
  }

  /**
   * 縦持ちで HUD（パネル）が必要とする高さ（画面 px）。#hud の上下 padding とパネル間の gap を含む。
   * パネルは overflow:auto で縮められるので、見えている高さと中身の高さ（scrollHeight）の大きい方を使う。
   */
  private hudNeedH(): number {
    const hud = document.getElementById("hud");
    if (!hud) return 0;
    const cs = getComputedStyle(hud);
    const panels = [...hud.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
    const sum = panels.reduce((acc, p) => {
      const rect = p.getBoundingClientRect().height;
      const content = p.scrollHeight + (p.offsetHeight - p.clientHeight);
      return acc + Math.max(rect, content);
    }, 0);
    const gap = parseFloat(cs.rowGap) || 0;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    return Math.ceil(sum + gap * Math.max(0, panels.length - 1) + pad);
  }

  /** 横持ち・マップを離れるときは canvas を 320×180 に戻し、HUD の位置も元に戻す。 */
  private resetView(): void {
    document.documentElement.style.removeProperty("--ld-canvas-h");
    if (this.scale.gameSize.height === GAME_HEIGHT * RENDER_SCALE) return;
    this.scale.setGameSize(GAME_WIDTH * RENDER_SCALE, GAME_HEIGHT * RENDER_SCALE);
    this.cameras?.main?.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.backdrop?.resize(GAME_HEIGHT);
  }

  /**
   * 横持ちで HUD パネルの上端（canvas の内部 px）。パネルの高さは内容と画面の高さで変わるので、
   * 描くたびに実測する。パネルが無ければ canvas の全高。
   */
  private hudTopInCanvas(): number {
    const canvasRect = this.game.canvas.getBoundingClientRect();
    if (canvasRect.height === 0) return GAME_HEIGHT;
    const tops = [...document.querySelectorAll<HTMLElement>("#hud .hud-panel")]
      .map((p) => p.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .map((r) => r.top);
    if (tops.length === 0) return GAME_HEIGHT;
    return ((Math.min(...tops) - canvasRect.top) / canvasRect.height) * GAME_HEIGHT;
  }

  private redrawMap(): void {
    this.clearMapObjects();
    this.drawMap(current());
  }

  /** 演出レイヤー(fx-*)は消さずに、マップの描画物だけ消す。 */
  private clearMapObjects(): void {
    this.reflowTween?.stop();
    this.reflowTween = null;
    for (const o of [...this.children.list]) {
      if (!(o instanceof Phaser.GameObjects.Image && o.texture.key.startsWith("fx-"))) o.destroy();
    }
  }

  private act(a: Action): void {
    const next = dispatch(a);
    mapTutorial().observe(next);
    const to = sceneFor(next);
    if (to !== "map") {
      goTo(this, to);
      return;
    }
    this.fx?.emitRunEvents(next.events);
    const redraw = (): void => {
      // HUD の高さが変わると canvas の高さも変わる（RESIZE で描き直されることがあるので、消してから描く）
      this.renderHud(next);
      this.applyView();
      this.clearMapObjects();
      this.drawMap(next);
    };
    if (next.events.some((e) => e.t === "descended") && fxEnabled()) {
      // 階段: 暗転 out 200ms → 描き直し → in 200ms（Issue #104）
      setHudBusy(true);
      markFade(IMPACT.stairsOutMs + IMPACT.stairsInMs);
      const { r, g, b } = IMPACT.stairsFade;
      const cam = this.cameras.main;
      cam.fadeOut(IMPACT.stairsOutMs, r, g, b);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        redraw();
        setHudBusy(false);
        cam.fadeIn(IMPACT.stairsInMs, r, g, b);
      });
      return;
    }
    redraw();
    if (next.events.some((e) => e.t === "looted")) {
      const c = this.roomCenters.get(next.roomId);
      // 箱（16px）を部屋ラベル（箱の下端付近）と逆側＝上にずらし、ラベルに重ならないようにする（P2 #147）
      if (c) chestOpenFx(this, c.x, Math.min(c.y, c.y + this.roomPx / 2 - CHEST_LIFT_PX));
    }
  }

  private drawMap(s: RunState): void {
    const rooms = s.floor.rooms;
    const visible = rooms.filter((r) => isShownOnMap(r, s));
    // 縦持ち（aspect<1）は HUD が canvas の下なので、マップに canvas の全高を使う（#114、#121 で canvas 自体を伸ばした）
    const portrait = window.matchMedia("(max-aspect-ratio: 1/1)").matches;
    const drawnFrom = this.children.list.length;
    // 横持ちは HUD パネルの上端より上（余白 HUD_GAP を空けて）に収める（#89 の差し戻し）
    // 縦持ちは描く部屋の行範囲（bbox）で縦を決める（#121 A）。横の格子は全部屋で決まったまま。
    const layout = calcMapLayout(
      rooms,
      portrait
        ? { availH: this.scale.gameSize.height / RENDER_SCALE, shown: visible }
        : { mapBottom: this.hudTopInCanvas() - HUD_GAP },
    );
    const { CELL, ROOM, ORIGIN_X, ORIGIN_Y } = layout;
    const CELL_Y = layout.CELL_Y ?? CELL;
    this.roomPx = ROOM;
    const dense = isDense(layout);

    function center(r: RoomState): { x: number; y: number } {
      return { x: ORIGIN_X + r.x * CELL, y: ORIGIN_Y + r.y * CELL_Y };
    }

    this.roomCenters.clear();
    for (const r of rooms) this.roomCenters.set(r.id, center(r));
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
      const chestIcon =
        r.visited && r.content.kind === "chest" && !dense && ROOM >= CHEST_ICON_PX + 4;
      if (chestIcon) {
        const ix = Math.round(x - CHEST_ICON_PX / 2);
        const iy = Math.round(y - CHEST_ICON_PX / 2);
        g.fillStyle(COLOR.chest, 1).fillRect(ix, iy, CHEST_ICON_PX, CHEST_ICON_PX);
        g.fillStyle(COLOR.bg, 1)
          .fillRect(ix, iy + 3, CHEST_ICON_PX, 1)
          .fillRect(ix + 3, iy + 4, 2, 2);
      }
      if (sym && !chestIcon && symbolFits(layout)) {
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
      const label = roomLabelText(r, layout, isHere);
      if (label) {
        // ラベルの下地: 縦の接続線がラベルの文字を貫通して読みにくくなるのを防ぐ（#120）。
        // 線は描いたまま、文字の背後だけ背景色で抜く（lines → 下地 → 文字 の順）
        const plate = this.add.graphics();
        const text = this.add
          .text(x, y + ROOM / 2 + (portrait ? 2 : -2), label, {
            fontFamily: FONT_FAMILY,
            fontSize: `${portrait ? PORTRAIT_ID_FONT_PX : ID_FONT_PX}px`,
            color: isHere ? COLOR.text : COLOR.weak,
            stroke: COLORS.bg,
            strokeThickness: portrait ? 4 : 1,
          })
          .setOrigin(0.5, 0)
          .setResolution(RENDER_SCALE);
        const tb = text.getBounds();
        // 箱の枠（下端）は削らない: 下地の上端は箱の下端より下にそろえる
        const top = Math.max(tb.y, y + ROOM / 2 + 1);
        plate.fillStyle(COLOR.bg, 1).fillRect(tb.x - 1, top, tb.width + 2, tb.bottom - top);
        // #115: 演出の front レイヤー(depth 10)より手前に置き、撃破・階段の演出中も部屋名を読めるようにする
        // 下地は文字より下、文字は下地より上（#120）
        plate.setDepth(LABEL_DEPTH);
        text.setDepth(LABEL_DEPTH + 0.1);
      }
    }
    if (portrait) {
      // 描く行が増減して bbox が変わった再配置だけ滑らせる。同じ配置の描き直しや画面サイズ変更では動かさない。
      const rowMin = Math.min(...visible.map((r) => r.y));
      const spanH = Math.max(...visible.map((r) => r.y)) - rowMin + 1;
      const topY = ORIGIN_Y + rowMin * CELL_Y;
      const prev = this.prevVert;
      this.prevVert = { floor: s.floor.number, rowMin, spanH, topY };
      if (
        prev &&
        prev.floor === s.floor.number &&
        (prev.rowMin !== rowMin || prev.spanH !== spanH)
      ) {
        const created = this.children.list
          .slice(drawnFrom)
          .filter(
            (o): o is Phaser.GameObjects.Graphics | Phaser.GameObjects.Text =>
              o instanceof Phaser.GameObjects.Graphics || o instanceof Phaser.GameObjects.Text,
          );
        this.slideMap(created, prev.topY - topY);
      }
    }
  }

  /**
   * 描き直したマップを、旧位置（dy だけずれた位置）から 200ms で新位置へ滑らせる（#121 A）。
   * OS の「視差効果を減らす」が有効なら滑らせず即時に新位置へ置く。
   */
  private slideMap(
    objs: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Text)[],
    dy: number,
  ): void {
    if (dy === 0) return;
    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !fxEnabled()) return;
    const base = objs.map((o) => o.y);
    const place = (k: number): void => {
      objs.forEach((o, i) => {
        o.y = (base[i] ?? o.y) + dy * k;
      });
    };
    place(1);
    this.reflowTween = this.tweens.addCounter({
      from: 1,
      to: 0,
      duration: 200,
      ease: "Sine.easeOut",
      onUpdate: (tween) => place(tween.getValue() ?? 0),
      onComplete: () => place(0),
    });
  }

  private renderHud(s: RunState): void {
    const here = s.floor.rooms.find((r) => r.id === s.roomId);
    const neighbors = (here?.neighbors ?? [])
      .map((id) => s.floor.rooms.find((r) => r.id === id))
      .filter((r): r is RoomState => r !== undefined);
    const legal = legality(s);

    const tut = mapTutorial().view(s);
    const hl = (b: HTMLButtonElement, on: boolean): HTMLButtonElement => {
      if (on) {
        b.classList.add("hud-btn--tutorial");
        if (fxEnabled()) b.classList.add("hud-btn--pulse");
      }
      return b;
    };

    // 宝箱ボタンの生成
    const chestBtn = (() => {
      if (here?.content.kind !== "chest") return null;
      const skill = here.content.skill;
      const name = skillInfo(skill).name;
      const a: Action = { t: "loot", pick: skill };
      return hl(
        button(`宝箱を開ける: ${name}`, () => this.act(a), { disabled: !legal.can(a) }),
        tut?.target.kind === "chest",
      );
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
            return hl(
              button(moveLabel(r, s), () => this.act(a), { disabled: !legal.can(a) }),
              tut?.target.kind === "move" && tut.target.rooms.includes(r.id),
            );
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
                { style: "color: var(--ld-danger); font-size: 12px;", "aria-live": "polite" },
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
    renderHud("map", panel, tut ? this.tutorialBubble(tut) : null);
    document.documentElement.classList.toggle("has-map-tutorial", tut !== null);
  }

  /** 下部固定の1行吹き出し（ステップ n/4・role="status"）とスキップボタン。 */
  private tutorialBubble(tut: TutorialView): HTMLElement {
    return el(
      "div",
      { class: "map-tutorial" },
      el(
        "p",
        { class: "map-tutorial__text", role: "status" },
        `ステップ ${tut.step}/${tut.total}: ${tut.text}`,
      ),
      button("スキップ", () => {
        mapTutorial().skip();
        this.renderHud(current());
        this.applyView();
        this.redrawMap();
      }),
    );
  }
}
