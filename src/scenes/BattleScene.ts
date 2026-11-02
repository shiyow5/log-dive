import Phaser from "phaser";
import * as glitch from "pixelfx/fx/scifi/glitch";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { PixelFxLayer } from "../fx/PixelFxLayer";
import { Rng } from "../core/rng";
import { fxEnabled } from "../ui/flags";
import { button, el, renderHud, setHudBusy } from "../ui/hud";
import { abandonButton, logLine, statsRow } from "./hud-parts";
import { BUG_NAME, SKILL_COST, current, dispatch, sceneFor } from "./run-port";
import type { Action, BattleState, RunState } from "./run-port";
import { fadeIn, goTo } from "./transition";

/** 縦切りで使うスキル4枚（breakpoint・bisect は宝箱で入るので 11/05 以降）。 */
const SKILLS = [
  { id: "reproduce", name: "再現手順" },
  { id: "read-log", name: "ログ確認" },
  { id: "hotfix", name: "ホットフィックス" },
] as const;

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
      .text(BUG_X, BUG_Y, "?", { fontFamily: "monospace", fontSize: "16px", color: "#ff6b5e" })
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
    const here = s.rooms[s.current];

    const candidates = el(
      "section",
      { "aria-label": "候補" },
      el("h3", {}, `候補（${b.candidates.length}）`),
      el("ul", { class: "hud-list" }, ...b.candidates.map((c) => el("li", {}, BUG_NAME[c]))),
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

    const skillRow = el(
      "div",
      { class: "hud-row", role: "group", "aria-label": "スキル" },
      ...SKILLS.map((k) =>
        button(`${k.name}（CPU ${SKILL_COST[k.id]}）`, () => this.act({ t: "skill", id: k.id }), {
          disabled: s.cpu < SKILL_COST[k.id],
        }),
      ),
      button(
        `修正パッチ（CPU ${SKILL_COST.patch}）`,
        () => {
          this.picking = true;
          this.renderHud(current());
        },
        { disabled: s.cpu < SKILL_COST.patch },
      ),
    );

    const picker = this.picking
      ? el(
          "div",
          { class: "hud-row", role: "group", "aria-label": "パッチの種類" },
          el("span", { class: "hud-stat" }, "どの種類として直す？"),
          ...b.candidates.map((c, i) => {
            const btn = button(BUG_NAME[c], () => this.act({ t: "skill", id: "patch", arg: c }), {
              label: `パッチを当てる: ${BUG_NAME[c]}`,
            });
            if (i === 0) btn.dataset.autofocus = "";
            return btn;
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
        b.reproduced ? el("span", { class: "hud-ok" }, "　✓ 再現済み") : null,
      ),
      statsRow(s),
      el("div", { class: "hud-cols" }, candidates, symptoms),
      skillRow,
      picker,
      el(
        "div",
        { class: "hud-row" },
        button("ターン終了", () => this.act({ t: "endTurn" }), { primary: true }),
        abandonButton(() => this.act({ t: "abandon" })),
      ),
      logLine(s),
    );
    renderHud("battle", panel);
  }
}
