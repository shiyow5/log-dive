# 開発の進め方（運用ルール）

## main への変更

1. `main` から作業ブランチを切る（例: `feat/floor-1`, `fix/save-corrupt`）
2. PR を作る。説明に「何を・なぜ・どう確かめたか」を書く
3. CI（`format`・`lint`・`test`・`e2e`）がすべて SUCCESS になるまで直す
4. PL（toru）がレビューして Approve
5. rei が「repo名＋PR番号＋head SHA」を haruto に送る → 東雲が承認 → マージ（squash）

**main への直接 push は禁止。** このリポジトリは Private かつ GitHub Free のため、
ブランチ保護（PR 必須・CI 必須）を GitHub 側で強制できない。代わりに:

- `main-guard` ワークフローが、PR を経由しない main への push を検出して失敗させる（防止ではなく検出）
- 検出されたら rei に報告し、revert の PR を出す

## ルール（src/core）の約束

- Phaser・DOM・`Math.random`・`Date.now`・`performance.now` を使わない（決定性が崩れる）
- 乱数は `Rng`。シードは run の最初に1つ決めて保存する
- 数値（HP・コスト・出現率など）はコードに直書きせず `src/data/*.json` に置く
- 新しいルールにはユニットテストを付ける

## 素材

- 追加するときは同じ PR で `CREDITS.md` に1行足す
- 有料ツール・API キーが必要なツールは使わない（必要なら rei → haruto に相談）

## コミットメッセージ

`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:` で始める
