import Phaser from "phaser";
import { setupView } from "./view";
import { BUG_POS, FONT_FAMILY, RENDER_SCALE } from "../config";
import { createSceneFx } from "../fx/scene-fx";
import type { FxDirector } from "../fx/FxDirector";
import { Rng } from "../core/rng";
import { ensureBugTexture } from "../art/bug-sprite";
import { button, el, renderHud, setHudBusy } from "../ui/hud";
import { abandonButton, logLine, statsRow } from "./hud-parts";
import { bugName, current, dispatch, legality, sceneFor, skillInfo } from "./run-port";
import type { Action, BattleState, RunState } from "./run-port";
import { fadeIn, goTo } from "./transition";

const BUG_X = BUG_POS.x;
const BUG_Y = BUG_POS.y;
const BAR_W = 48;
// HP バーは虫の上。下に置くと PC 幅（1280×720）で HUD パネル（上端 ≒ y69）に隠れる。ボス 4 倍の頭（y12）との間に 4px 空ける。
const BAR_Y = BUG_Y - 40;
const BUG_TEX = "bug-sprite";

export class BattleScene extends Phaser.Scene {
  private fx?: FxDirector;
  private hpBar?: Phaser.GameObjects.Graphics;
  private hpText?: Phaser.GameObjects.Text;
  /** patch の種類を選んでいる途中か */
  private picking = false;

  constructor() {
    super("battle");
  }

  create(): void {
    setupView(this);
    fadeIn(this);
    this.picking = false;
    const s = current();
    const fx = createSceneFx(this, "fx-battle");
    this.fx = fx;
    this.drawBug(s);
    // バグ出現 = グリッチ＋雷（0.6 秒だけ入力を止める）
    if (s.battle && fx.emit("battleStart", new Rng(s.seed).int(1, 9999))) {
      setHudBusy(true);
      this.time.delayedCall(600, () => setHudBusy(false));
    }
    this.renderHud(s);
  }

  private act(a: Action): void {
    this.picking = false;
    const next = dispatch(a);
    const to = sceneFor(next);
    if (to !== "battle") {
      goTo(this, to);
      return;
    }
    this.fx?.emitRunEvents(next.events);
    this.drawHp(next.battle);
    this.renderHud(next);
  }

  private drawBug(s: RunState): void {
    const b = s.battle;
    if (!b) return;
    // 16x16 ドット絵（全バグ共通の「正体不明の虫」）。3 倍=48px。ボスは 4 倍。
    ensureBugTexture(this.textures, BUG_TEX);
    const scale = b.boss ? 4 : 3;
    const img = this.add.image(BUG_X, BUG_Y, BUG_TEX).setScale(scale);
    img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    // 正体未特定の印。『?』を虫の右上に重ねる
    this.add
      .text(BUG_X + 8 * scale, BUG_Y - 8 * scale, "?", {
        fontFamily: FONT_FAMILY,
        fontSize: "16px",
        color: "#ffd166",
      })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE);
    this.hpBar = this.add.graphics();
    this.hpText = this.add
      .text(BUG_X - BAR_W / 2 - 4, BAR_Y + 2, "", {
        fontFamily: FONT_FAMILY,
        fontSize: "12px",
        color: "#e4f1ec",
      })
      .setOrigin(1, 0.5)
      .setResolution(RENDER_SCALE);
    this.drawHp(b);
  }

  private drawHp(b: BattleState | null): void {
    const g = this.hpBar;
    if (!g || !b) return;
    g.clear();
    const x = BUG_X - BAR_W / 2;
    g.fillStyle(0x1b2b2e, 1);
    g.fillRect(x, BAR_Y, BAR_W, 4);
    g.fillStyle(0xff6b5e, 1);
    g.fillRect(x, BAR_Y, Math.round((BAR_W * b.hp) / b.maxHp), 4);
    // 数値はバーの左に（右上の『?』と重ねない）（色だけに頼らない）
    this.hpText?.setText(`${b.hp}/${b.maxHp}`);
  }

  private renderHud(s: RunState): void {
    const b = s.battle;
    if (!b) return;
    const here = s.floor.rooms.find((r) => r.id === s.roomId);
    const legal = legality(s);
    /** 押せないボタンの理由（core の lastError.message）。ボタンから aria-describedby で指す。 */
    const reasons: HTMLElement[] = [];
    const withReason = (btn: HTMLButtonElement, name: string, why: string | null) => {
      if (!btn.disabled || !why) return btn;
      const id = `why-${reasons.length}`;
      reasons.push(el("li", { id, class: "hud-stat" }, `${name}: ${why}`));
      btn.setAttribute("aria-describedby", id);
      return btn;
    };

    const candidates = el(
      "section",
      { "aria-label": "候補" },
      el("h3", {}, `候補（${b.candidates.length}）`),
      el(
        "ul",
        { class: "hud-list hud-cands" },
        ...b.candidates.map((c) => el("li", {}, `? ${bugName(c)}`)),
      ),
    );
    const symptoms = el(
      "section",
      { "aria-label": "症状" },
      el("h3", {}, "症状"),
      b.symptoms.length
        ? el(
            "ul",
            { class: "hud-list" },
            ...b.symptoms.map((t) => el("li", { class: "hud-hint" }, t)),
          )
        : el("p", { class: "hud-stat" }, b.reproduced ? "（なし）" : "まだ再現していない"),
    );

    const owned = s.player.skills.filter((id) => id !== "patch");
    const hasPatch = s.player.skills.includes("patch");
    const patchActions = b.candidates.map((c): Action => ({ t: "skill", id: "patch", arg: c }));
    const canPatch = patchActions.some((a) => legal.can(a));

    const skillRow = el(
      "div",
      { class: "hud-row", role: "group", "aria-label": "スキル" },
      ...owned.map((id) => {
        const k = skillInfo(id);
        const a: Action = { t: "skill", id };
        const btn = button(`${k.name}（CPU ${k.cpu}）`, () => this.act(a), {
          disabled: !legal.can(a),
        });
        return withReason(btn, k.name, legal.why(a));
      }),
      hasPatch
        ? (() => {
            const k = skillInfo("patch");
            const btn = button(
              `${k.name}（CPU ${k.cpu}）`,
              () => {
                this.picking = true;
                this.renderHud(current());
              },
              { disabled: !canPatch },
            );
            // 候補ぜんぶ押せないときは先頭の候補の理由を出す（未再現なら not_reproduced が先に来る）
            const first = patchActions[0];
            return withReason(btn, k.name, first ? legal.why(first) : null);
          })()
        : null,
    );

    const picker =
      this.picking && canPatch
        ? el(
            "div",
            { class: "hud-row", role: "group", "aria-label": "パッチの種類" },
            el("span", { class: "hud-stat" }, "どの種類として直す？"),
            ...patchActions.map((a, i) => {
              const c = a.t === "skill" ? a.arg : undefined;
              const name = c ? bugName(c) : "";
              const btn = button(name, () => this.act(a), {
                label: `パッチを当てる: ${name}`,
                disabled: !legal.can(a),
              });
              if (i === 0) btn.dataset.autofocus = "";
              return withReason(btn, name, legal.why(a));
            }),
            button(
              "やめる",
              () => {
                this.picking = false;
                this.renderHud(current());
              },
              { label: "パッチをやめる" },
            ),
          )
        : null;

    const endTurn: Action = { t: "endTurn" };
    // 3段構造（#87）: 上段=敵名・HP・予告・ステータス（固定）/ 中段=候補・症状・スキル（ここだけスクロール）
    // / 下段=ターン終了（固定）+ 放棄は最下段の別行（ゴースト・右寄せ、#119）。2階以降で候補が増えても主ボタンが画面外に出ない。
    const panel = el(
      "section",
      { class: "hud-panel hud-panel--battle", "aria-label": "バトル" },
      el(
        "header",
        { class: "hud-battle-head" },
        el(
          "div",
          { class: "hud-battle-title" },
          el(
            "h2",
            {},
            `${here?.label ?? ""} — 正体不明のバグ `,
            el("span", { class: "hud-danger" }, `HP ${b.hp}/${b.maxHp}`),
          ),
          // 危険操作はパネル右上（ターン終了から離す。#119）
          abandonButton(() => this.act({ t: "abandon" })),
        ),
        el(
          "p",
          { class: "hud-stat" },
          "予告: 次のターン ",
          el("strong", { class: "hud-danger" }, `${b.intent.damage} ダメージ`),
          b.intent.countdown !== undefined
            ? el("span", {}, `（大ダメージまで ${b.intent.countdown}）`)
            : null,
          b.reproduced ? el("span", { class: "hud-ok" }, "　✓ 再現済み") : null,
        ),
        statsRow(s),
      ),
      el(
        "div",
        { class: "hud-battle-body" },
        el("div", { class: "hud-cols" }, candidates, symptoms),
        // 操作ボタン群。横持ちスマホ（hud.css の @media）では右列に分けて、情報と操作を並べる（#113）
        el(
          "div",
          { class: "hud-battle-actions" },
          skillRow,
          picker,
          reasons.length
            ? el("ul", { class: "hud-list", "aria-label": "使えない理由" }, ...reasons)
            : null,
          logLine(s),
        ),
      ),
      el(
        "footer",
        { class: "hud-battle-foot" },
        button("ターン終了", () => this.act(endTurn), {
          primary: true,
          disabled: !legal.can(endTurn),
        }),
      ),
    );
    renderHud("battle", panel);
  }
}
