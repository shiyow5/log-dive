# ログ潜り ― Log Dive

《ログ潜り ― Log Dive》ローグライク×デバッグ推理（ブラウザゲーム / Vite + TypeScript + Phaser 3 + pixelfx）

> 状態: 最小版（11/07）。Pages で遊べます

## 試遊方法

**ブラウザで開くだけで遊べる → https://shiyow5.github.io/log-dive/**

（`main` に反映されるたび GitHub Pages に自動で公開される。）

以下は補助の手順。

### A. CI のビルド済みファイルで遊ぶ（補助）（Node.js 不要）

1. GitHub の **Actions** タブ → `CI` ワークフロー → main の最新の成功した実行を開く
2. 下の **Artifacts** から `game-build` をダウンロードして解凍する（14日で消える）
3. 解凍したフォルダで簡易サーバーを起動し、ブラウザで開く
   ```bash
   cd game-build
   python3 -m http.server 8000
   # → http://localhost:8000 を開く
   ```
   ※ `index.html` をダブルクリックで開くと、ブラウザの制限（file:// で module を読めない）で動かない。必ずサーバー経由で。

gh CLI なら: `gh run download -R shiyow5/log-dive -n game-build -D game-build`（最新の実行）

### B. 手元でソースから起動する（補助）（Node.js 22 以上）

```bash
git clone https://github.com/shiyow5/log-dive.git
cd log-dive
npm ci
npm run dev        # → 表示された http://localhost:5173 を開く
```

### 試遊の流れ（1ラン = 3階＋ボス、10〜15分）

1. タイトルで **新しいラン**（シード欄を空にするとランダム。同じシードなら同じ盤面になる。例: `?seed=e2e-full-1` を URL に付ける）
2. **マップ**: 隣の部屋ボタンで移動する。未踏の部屋に入ると、バグがいれば戦闘になる。宝箱の部屋では **宝箱を開ける** で新しいスキルを受け取る（1階: ブレークポイント、2階: 二分探索）
3. **戦闘**: バグの正体は最初わからない。**再現手順**（CPU 1）で再現 → 症状と候補を見て **修正パッチ**（CPU 2）で種類を選んで当てる。外すとバグが悪化する。CPU が足りなければ **ターン終了**（バグの予告ダメージを受ける）
4. その階のバグを全部閉じると階段が開く（マップに ▼）。階段の部屋に入ると次の階へ
5. 3階のボスを倒すと「復旧完了」。HP が 0 になるか **ランを放棄** でリザルトへ

この流れは `e2e/full-run.spec.ts`（シード `e2e-full-1` で1階→3階→ボス撃破まで HUD のボタンで通す）で毎回 CI が確かめている。

## 開発

| コマンド            | 内容                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `npm run dev`       | 開発サーバー（保存すると即反映）                                       |
| `npm test`          | ユニットテスト（Vitest）。ルールのテストはここ                         |
| `npm run test:e2e`  | ブラウザテスト（Playwright）。初回は `npx playwright install chromium` |
| `npm run typecheck` | 型チェック                                                             |
| `npm run build`     | 本番ビルド → `dist/`                                                   |

### フォルダ構成と設計方針

- `src/core/` … **ルール（純粋 TypeScript）**。Phaser・DOM・`Math.random`・`Date.now` を使わない。乱数は `Rng`（シード付き）。だから同じシード＋同じ操作なら同じ結果になり、テストとリプレイ（バグ再現）ができる
- `src/scenes/` … 画面（Phaser）。ルールの結果を描くだけ
- `src/fx/` … 演出（pixelfx）。ルールからは参照しない
- `tests/unit/` … Vitest、`e2e/` … Playwright

| 共通部品       | ファイル             | 役割                                                                               |
| -------------- | -------------------- | ---------------------------------------------------------------------------------- |
| シード付き乱数 | `src/core/rng.ts`    | sfc32。`state` で途中保存・再開                                                    |
| グリッド       | `src/core/grid.ts`   | 近傍・走査は固定順（決定性のため）                                                 |
| セーブ         | `src/core/save.ts`   | localStorage。バージョン＋チェックサム（破損・誤コピー検出用。改ざん防止ではない） |
| リプレイ       | `src/core/replay.ts` | シード＋入力列で再生                                                               |

（log-dive / auto-encore で同じ部品をコピーして使っている。リポジトリは別）

## ルール

- 変更は必ずブランチ → PR → CI 通過 → レビュー → マージ。詳細は [CONTRIBUTING.md](CONTRIBUTING.md)
- 素材は自作か、ライセンスを確認した無料素材だけ。**1件ずつ [CREDITS.md](CREDITS.md) に記録**してからコミットする
