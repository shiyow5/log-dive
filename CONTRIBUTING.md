# 開発の進め方（運用ルール）

## main への変更

1. `main` から作業ブランチを切る（例: `feat/floor-1`, `fix/save-corrupt`）
2. PR を作る。説明に「何を・なぜ・どう確かめたか」を書く
3. CI（`format`・`lint`・`test`・`e2e`）がすべて SUCCESS になるまで直す。重い `e2e` は Actions 無料枠節約のため、PR では `run-e2e` ラベルを付けたときだけ実行される（付けないとスキップ＝SUCCESS扱い）。main への push 時と、Actions の手動実行（workflow_dispatch）でも実行される。マージ前・Approve前には `run-e2e` を付けて1回通すこと
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

## Secrets・素材

- Secrets・`.env` は絶対にコミットしない（`.gitignore` 済み。例は `.env.example` のみ）
- 画像・音などの素材は `CREDITS.md` に1件ずつ記録する

## レビュースタンダード

DRY/SOLID原則を基本としたレビューを行います。PR作成時は `.github/PULL_REQUEST_TEMPLATE.md` のチェックリストに✓をつけてください。
詳細なレビュー基準は `common_knowledge/game-planning/review-criteria.md` を参照してください。

## コミットメッセージ

`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:` で始める
