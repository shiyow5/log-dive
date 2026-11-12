import { STORY } from "./story-text";
import Phaser from "phaser";
import { setupView } from "./view";
import { BUG_POS, FONT_FAMILY, RENDER_SCALE } from "../config";
import { createSceneFx } from "../fx/scene-fx";
import type { FxDirector } from "../fx/FxDirector";
import { Rng } from "../core/rng";
import {
  enemyKindFor,
  enemyTextureKey,
  ensureEnemyTextures,
  type EnemyKind,
} from "../art/enemy-sprites";
import { button, el, renderHud, setHudBusy } from "../ui/hud";
import { abandonButton, cpuDots, logLine, statsRow } from "./hud-parts";
import { recommend } from "./battle-hint";
import { bugName, current, dispatch, legality, sceneFor, skillInfo } from "./run-port";
import type { Action, BattleState, RunError, RunState } from "./run-port";
import { shortReason } from "./battle-reason";
import { fadeIn, goTo } from "./transition";
import { IMPACT, damagePop, edgeFlash, shakeX } from "../fx/impact-fx";
import { flashLogLine } from "../ui/hud-flash";

/**
 * スキルボタンの「（CPU n）」を nowrap の子要素にまとめる（#142 の 844×390 で「（CPU」と「1）」が割れないように）。
 * textContent は「名前（CPU n）」のままなので、ボタンの名前・テストの照合は変わらない。
 */
function withCpuTag(btn: HTMLButtonElement, name: string, cpu: number): HTMLButtonElement {
  btn.replaceChildren(name, el("span", { class: "hud-cpu-tag" }, `（CPU ${cpu}）`));
  return btn;
}

const BUG_X = BUG_POS.x;
const BUG_Y = BUG_POS.y;
const BAR_W = 48;
/** 未特定の敵のシルエット色（minori 指定 #5a7a80）。 */
const SILHOUETTE = 0x5a7a80;
/** HP 数値が減ったときの色（minori 指定 #e8c468・200ms）。 */
const HIT_NUM_COLOR = "#e8c468";
// HP バーは虫の上。下に置くと PC 幅（1280×720）で HUD パネル（上端 ≒ y69）に隠れる。ボス 4 倍の頭（y12）との間に 4px 空ける。
// #142: 敵 HP が画面上端ぎりぎり（y≈5）だったので、敵ごと 4 ドット（1280 幅で 16px）下げる。
const ENEMY_DY = 4;
const BAR_Y = BUG_Y + ENEMY_DY - 40;
// #166: ボス（64px・4倍）は上に HP バーを置く余白がなく、バーが頭（角）に接していた。
// ボスだけ、バーと数値を虫の左に置き、『?』は右に置く。どちらも虫の枠（x 128〜192）から 4px 以上離す。
const BOSS_HALF = 32;
const BOSS_GAP = 4;

/** ダメージ数字の位置。敵の右上（HP バー・敵名・『?』に重ねない）／稼働率は画面左下の余白。 */
const PLAYER_POP = { x: 24, y: 40 } as const;
function enemyPopPos(scale: number): { x: number; y: number } {
  return { x: BUG_X + 8 * scale + 20, y: BUG_Y + ENEMY_DY };
}

export class BattleScene extends Phaser.Scene {
  private fx?: FxDirector;
  private hpBar?: Phaser.GameObjects.Graphics;
  private hpText?: Phaser.GameObjects.Text;
  /** HP バー左端の x（通常は虫の真上の中央、ボスは虫の左） */
  private barX = BUG_X - BAR_W / 2;
  private enemyImg?: Phaser.GameObjects.Image;
  private enemyKind: EnemyKind = "bug";
  private lastHp = 0;
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
    this.fx?.emitRunEvents(next.events);
    this.impact(next.events);
    this.drawHp(next.battle);
    this.renderHud(next);
    if (next.events.some((e) => e.t === "candidateRemoved")) flashLogLine();
    if (to !== "battle") {
      // 終局の一撃・致死被弾も、ダメージ数字と被弾演出を見せてから遷移する（PR #147 review）
      setHudBusy(true);
      this.time.delayedCall(IMPACT.finalHoldMs, () => goTo(this, to));
    }
  }

  /** 被弾シェイク・縁フラッシュ・ダメージ数字（Issue #104）。座標は敵・稼働率の位置から決める。 */
  private impact(events: RunState["events"]): void {
    for (const e of events) {
      if (e.t === "playerDamaged") {
        shakeX(this);
        edgeFlash(this);
        damagePop(this, PLAYER_POP.x, PLAYER_POP.y, `-${e.amount}`, IMPACT.playerColor);
      } else if (e.t === "bugDamaged") {
        const scale = current().battle?.boss ? 4 : 3;
        const pos = enemyPopPos(scale);
        damagePop(this, pos.x, pos.y, `${e.amount}`, IMPACT.bugColor);
      }
    }
  }

  private drawBug(s: RunState): void {
    const b = s.battle;
    if (!b) return;
    // 16x16 ドット絵（通常 3 種は部屋 ID で決める＝BugId のヒントにしない）。3 倍=48px。ボスは 4 倍。
    ensureEnemyTextures(this.textures);
    this.enemyKind = enemyKindFor(b.roomId, b.boss);
    const scale = b.boss ? 4 : 3;
    // ボス（64px）は PC 幅で下端が HUD パネル（上端 ≒ y69）に隠れるので 8px 上げる。HP バーは角の外側に収まる。
    const cy = (b.boss ? BUG_Y - 8 : BUG_Y) + ENEMY_DY;
    const img = this.add.image(BUG_X, cy, enemyTextureKey(this.enemyKind, "idle")).setScale(scale);
    // 正体未特定: #5a7a80 の単色シルエットにする（形は部屋由来のまま、色で種別を教えない）
    img.setTintFill(SILHOUETTE);
    this.enemyImg = img;
    this.lastHp = b.hp;
    // 待機: 2 フレーム目の代わりに 1px 単位でゆっくり上下（ぼやけないよう整数ピクセル）
    this.tweens.add({
      targets: img,
      y: cy + 1,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Stepped",
    });
    // 正体未特定の印。『?』を虫の右上に重ねる
    this.barX = b.boss ? BUG_X - BOSS_HALF - BOSS_GAP - BAR_W : BUG_X - BAR_W / 2;
    const qX = b.boss ? BUG_X + BOSS_HALF + BOSS_GAP + 8 : BUG_X + 8 * scale;
    this.add
      .text(qX, Math.max(cy - 8 * scale, 9), "?", {
        fontFamily: FONT_FAMILY,
        fontSize: "16px",
        color: "#ffd166",
      })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE);
    this.hpBar = this.add.graphics();
    this.hpText = this.add
      .text(this.barX - 4, BAR_Y + 2, "", {
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
    const x = this.barX;
    g.fillStyle(0x1b2b2e, 1);
    g.fillRect(x, BAR_Y, BAR_W, 4);
    g.fillStyle(0xff6b5e, 1);
    g.fillRect(x, BAR_Y, Math.round((BAR_W * b.hp) / b.maxHp), 4);
    // 5 分割の目盛り（色だけに頼らない）。赤いバーの連続を切らないよう、バーの直下に 1 本ずつ置く
    g.fillStyle(0xe4f1ec, 1);
    for (let i = 0; i <= 5; i++) {
      g.fillRect(x + Math.min(Math.round((BAR_W * i) / 5), BAR_W - 1), BAR_Y + 4, 1, 2);
    }
    // 数値はバーの左に（右上の『?』と重ねない）（色だけに頼らない）
    this.hpText?.setText(`${b.hp}/${b.maxHp}`);
    if (b.hp < this.lastHp && this.hpText) {
      const t = this.hpText;
      t.setColor(HIT_NUM_COLOR);
      this.time.delayedCall(200, () => {
        if (t.active) t.setColor("#e4f1ec");
      });
    }
    // 被弾フレーム（HP が減ったとき 250ms だけ）
    if (b.hp < this.lastHp && this.enemyImg) {
      const img = this.enemyImg;
      img.setTexture(enemyTextureKey(this.enemyKind, "hit"));
      this.time.delayedCall(250, () => {
        if (img.active) img.setTexture(enemyTextureKey(this.enemyKind, "idle"));
      });
    }
    this.lastHp = b.hp;
  }

  private renderHud(s: RunState): void {
    const b = s.battle;
    if (!b) return;
    const here = s.floor.rooms.find((r) => r.id === s.roomId);
    const legal = legality(s);
    /**
     * 押せないボタンの理由はボタン内2行目に短く出す（#94 minori 指定）。最下段の理由リストは廃止。
     * 全文（core の message）はホバーのツールチップと読み上げ（aria-describedby）に出す。
     * 2行目は aria-hidden なので、ボタンの名前（テストの照合）は変わらない。
     */
    let reasonCount = 0;
    const withReason = (btn: HTMLButtonElement, e: RunError | null) => {
      if (!btn.disabled || !e) return btn;
      const id = `why-${reasonCount++}`;
      btn.classList.add("hud-btn--why");
      btn.dataset.why = e.message;
      // 1行目（名前＋「（CPU n）」）は1かたまりにする（flex の列で名前と CPU が割れないように）
      btn.replaceChildren(
        el("span", { class: "hud-btn-name" }, ...Array.from(btn.childNodes)),
        el("span", { class: "hud-why", "aria-hidden": "true" }, shortReason(e.code)),
        // 全文は hidden（名前には入らず、aria-describedby からは読める）
        el("span", { id, hidden: true }, e.message),
      );
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

    const reproduceId = owned.find((id) => id === "reproduce");
    const rec = recommend(
      b.reproduced,
      !!reproduceId && legal.can({ t: "skill", id: reproduceId }),
      hasPatch && canPatch,
    );
    const mark = (btn: HTMLButtonElement, on: boolean) => {
      if (on) btn.dataset.recommended = "";
      return btn;
    };

    const skillRow = el(
      "div",
      { class: "hud-row hud-skills", role: "group", "aria-label": "スキル" },
      ...owned.map((id) => {
        const k = skillInfo(id);
        const a: Action = { t: "skill", id };
        const btn = withCpuTag(
          button(k.name, () => this.act(a), { disabled: !legal.can(a) }),
          k.name,
          k.cpu,
        );
        return withReason(mark(btn, rec === "reproduce" && id === reproduceId), legal.error(a));
      }),
      hasPatch
        ? (() => {
            const k = skillInfo("patch");
            const btn = withCpuTag(
              button(
                k.name,
                () => {
                  this.picking = true;
                  this.renderHud(current());
                },
                { disabled: !canPatch },
              ),
              k.name,
              k.cpu,
            );
            // 候補ぜんぶ押せないときは先頭の候補の理由を出す（未再現なら not_reproduced が先に来る）
            const first = patchActions[0];
            return withReason(mark(btn, rec === "patch"), first ? legal.error(first) : null);
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
              return withReason(btn, legal.error(a));
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
            ...(b.boss ? bossHeading() : [`${here?.label ?? ""} — 正体不明のバグ `]),
            el("span", { class: "visually-hidden" }, ` 敵の HP ${b.hp}/${b.maxHp}`),
          ),
          // 危険操作はパネル右上（ターン終了から離す。#119）
          abandonButton(() => this.act({ t: "abandon" })),
        ),
        el(
          "p",
          { class: "hud-stat" },
          "予告: 次のターン ",
          el("strong", { class: "hud-danger" }, `${b.intent.damage}`),
          " ダメージ",
          b.intent.countdown !== undefined
            ? el("span", {}, `（大ダメージまで ${b.intent.countdown}）`)
            : null,
          b.reproduced ? el("span", { class: "hud-ok" }, "　✓ 再現済み") : null,
        ),
        cpuDots(s),
        statsRow(s, { cpu: false }),
      ),
      el(
        "div",
        { class: "hud-battle-body" },
        el("div", { class: "hud-cols" }, candidates, symptoms),
        // 操作ボタン群。横持ちスマホ（hud.css の @media）では右列に分けて、情報と操作を並べる（#113）
        el("div", { class: "hud-battle-actions" }, skillRow, picker, logLine(s)),
      ),
      el(
        "footer",
        { class: "hud-battle-foot" },
        mark(
          button("ターン終了", () => this.act(endTurn), {
            primary: true,
            disabled: !legal.can(endTurn),
          }),
          rec === "endTurn",
        ),
      ),
    );
    // 戦闘の最初の描画（ボス登場文を見せたい）か、操作後の再描画（フォーカスを戻したボタンを残したい）かを区別する
    const redraw = document.body.dataset.scene === "battle";
    renderHud("battle", panel);
    // #158: 新しい行（ボス登場文など）がスクロール領域の下に隠れないよう、ログ行を見える位置まで送る。
    // 画面幅ごとにスクロールする要素が違う（中段・右列・HUD全体）ので、祖先すべてに効く scrollIntoView を使う。
    // 既に見えているときは何もしない（block: "nearest"）。
    panel.querySelector(".hud-log")?.scrollIntoView({ block: "nearest" });
    // #158 P2: ログを送ったせいで、フォーカスを戻したボタン（横持ちの上段スキル行など）が操作列から外れないよう、
    // フォーカス中のボタンが操作列の中にあるときは、そちらも見える位置へ送り直す（ログと同時に見えるときは動かない）。
    const focused = document.activeElement;
    if (
      redraw &&
      focused instanceof HTMLElement &&
      panel.querySelector(".hud-battle-actions")?.contains(focused)
    )
      focused.scrollIntoView({ block: "nearest" });
  }
}

/** ボス見出し。「— 」の後ろ（正体不明のバグ）は途中で折り返さないよう1かたまりにする（スマホ幅）。 */
function bossHeading(): (string | HTMLElement)[] {
  const [head = "", tail = ""] = STORY.bossTitle.split("— ");
  return [`${head}— `, el("span", { class: "hud-nowrap" }, `${tail} `)];
}
