import Phaser from "phaser";
import * as glitch from "pixelfx/fx/scifi/glitch";
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { PixelFxLayer } from "../fx/PixelFxLayer";
import { Rng } from "../core/rng";
import { fxEnabled } from "../ui/flags";
import { button, el, renderHud, setHudBusy } from "../ui/hud";
import { abandonButton, logLine, statsRow } from "./hud-parts";
import { bugName, current, dispatch, legality, sceneFor, skillInfo } from "./run-port";
import type { Action, BattleState, RunState } from "./run-port";
import { fadeIn, goTo } from "./transition";

const FX_KEY = "fx-battle";
const BUG_X = GAME_WIDTH / 2;
const BUG_Y = 44;

export class BattleScene extends Phaser.Scene {
  private fx?: PixelFxLayer;
  private hpBar?: Phaser.GameObjects.Graphics;
  /** patch の種類を選んでいる途中か */
  private picking = false;

  constructor() {
    super("battle");
  }

  create(): void {
    fadeIn(this);
    this.picking = false;
    this.fx = undefined;
    const s = current();
    this.drawBug(s);
    if (fxEnabled() && s.battle) {
      // バグ出現 = グリッチ（0.6 秒以内。再生中は入力を止める）
      if (this.textures.exists(FX_KEY)) this.textures.remove(FX_KEY);
      this.fx = new PixelFxLayer(this, FX_KEY, GAME_WIDTH, GAME_HEIGHT);
      this.fx.play(glitch, { x: BUG_X, y: BUG_Y, seed: new Rng(s.seed).int(1, 9999) });
      setHudBusy(true);
      this.time.delayedCall(600, () => setHudBusy(false));
    }
    this.renderHud(s);
  }

  override update(_time: number, delta: number): void {
    this.fx?.update(delta / 1000);
  }

  private act(a: Action): void {
    this.picking = false;
    const next = dispatch(a);
    const to = sceneFor(next);
    if (to !== "battle") {
      goTo(this, to);
      return;
    }
    this.drawHp(next.battle);
    this.renderHud(next);
  }

  private drawBug(s: RunState): void {
    const b = s.battle;
    if (!b) return;
    const g = this.add.graphics();
    g.fillStyle(0x26393d, 1);
    g.fillRect(BUG_X - 20, BUG_Y - 20, 40, 40);
    g.lineStyle(2, 0xff6b5e, 1);
    g.strokeRect(BUG_X - 20, BUG_Y - 20, 40, 40);
    this.add
      .text(BUG_X, BUG_Y, "?", {
        fontFamily: FONT_FAMILY,
        fontSize: "16px",
        color: "#ff6b5e",
      })
      .setOrigin(0.5);
    this.hpBar = this.add.graphics();
    this.drawHp(b);
  }

  private drawHp(b: BattleState | null): void {
    const g = this.hpBar;
    if (!g || !b) return;
    g.clear();
    const w = 48;
    const x = BUG_X - w / 2;
    const y = BUG_Y + 26;
    g.fillStyle(0x1b2b2e, 1);
    g.fillRect(x, y, w, 4);
    g.fillStyle(0xff6b5e, 1);
    g.fillRect(x, y, Math.round((w * b.hp) / b.maxHp), 4);
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
      el("ul", { class: "hud-list" }, ...b.candidates.map((c) => el("li", {}, `? ${bugName(c)}`))),
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
    const panel = el(
      "section",
      { class: "hud-panel", "aria-label": "バトル" },
      el(
        "h2",
        {},
        `${here?.label ?? ""} — 正体不明のバグ `,
        el("span", { class: "hud-danger" }, `HP ${b.hp}/${b.maxHp}`),
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
      el("div", { class: "hud-cols" }, candidates, symptoms),
      skillRow,
      picker,
      el(
        "div",
        { class: "hud-row" },
        button("ターン終了", () => this.act(endTurn), {
          primary: true,
          disabled: !legal.can(endTurn),
        }),
        abandonButton(() => this.act({ t: "abandon" })),
      ),
      reasons.length
        ? el("ul", { class: "hud-list", "aria-label": "使えない理由" }, ...reasons)
        : null,
      logLine(s),
    );
    renderHud("battle", panel);
  }
}
