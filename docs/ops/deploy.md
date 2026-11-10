# Deploy 運用手順

## デプロイ関連ワークフロー

### deploy-pages.yml — GitHub Pages へのデプロイ

- **ファイル**: `.github/workflows/deploy-pages.yml`
- **トリガー**:
  - `main` ブランチへの push
  - `workflow_dispatch`（手動実行）
- **権限**: `contents: read`, `pages: write`, `id-token: write`
- **ジョブ**:
  1. **build**: Node.js 22 で `npm ci` → `npm run build` → `dist` を artifact としてアップロード
  2. **deploy**: build 完了後に `actions/deploy-pages@v4` で GitHub Pages にデプロイ。`github-pages` environment 使用
- **concurrency**: group `pages`、`cancel-in-progress: false`（デプロイ中の新しい build を待機）

### nightly.yml — 毎晩 QA 実行

- **ファイル**: `.github/workflows/nightly.yml`
- **トリガー**:
  - cron: `0 18 * * *`（UTC 18:00 = JST 03:00）
  - `workflow_dispatch`（手動実行、seeds 入力可）
- **権限**: `contents: read`
- **ジョブ**:
  - **bot-1000**: `tests/qa/` 配下の vitest を実行。結果を `nightly-report/` に出力
  - 失敗時は artifact として `vitest.log` と seed/Replay JSON を 14 日間保持
- **補足**: PR の CI では実行されない。毎晩（JST 03:xx）と手動のみ。

### main-guard.yml — main への直接 push 検出

- **ファイル**: `.github/workflows/main-guard.yml`
- **トリガー**: `main` ブランチへの push
- **権限**: `contents: read`, `pull-requests: read`
- **目的**: Free プランではブランチ保護が使えないため、main への直接 push（マージ済み PR 経由でない push）を検出して CI を失敗させる
- **動作**:
  1. 初回 push（`before` が全 0）はスキップ
  2. `gh api repos/{owner}/{repo}/commits/{SHA}/pulls` でコミットがマージ済み PR 由来か確認
  3. マージ直後の反映遅延に備え、最大3回（10秒待機付き）リトライ
  4. マージ PR 由来でなければ `::error::` で失敗し "Report to rei/haruto." と出力
- **注意**: push を「防止」するものではなく、「検出して目立たせる」もの。運用ルール（CONTRIBUTING.md）と組み合わせて使用する。

## デプロイ失敗時の確認手順

1. **GitHub Actions の run を確認**
   - リポジトリ > Actions > 該当ワークフローの実行履歴
   - 失敗したジョブのログを確認（build 失敗 / deploy 失敗 / timeout）

2. **build 失敗の場合**
   - `npm run build` のログを確認（TypeScript エラー、依存関係の問題等）
   - ローカルで `npm run build` を再実行して再現確認
   - 不要な変更を revert するか修正して再 push

3. **deploy 失敗の場合**
   - `actions/deploy-pages@v4` のログを確認
   - GitHub Pages のステータス（Settings > Pages）を確認
   - environment `github-pages` の設定（restrictions 等）を確認

4. **main-guard の失敗の場合**
   - main への直接 push がないか確認（CONTRIBUTING.md のワークフローに則っているか）
   - 誤検知の場合は rei / haruto に報告

## ロールバック方法

### GitHub Pages へのロールバック

1. **revert PR → 再デプロイ**
   - `git revert <失敗したコミット>` で main を元の状態に戻す
   - PR 経由で main にマージ → deploy-pages.yml が自動的に再デプロイを実行

2. **workflow_dispatch による再実行**
   - deploy-pages.yml は `workflow_dispatch` で手動実行可能。main ブランチから再ビルド・再デプロイを実行する（ref 選択は不可）。ロールバックは主に revert PR 経由で行う

### Nightly 実行の再実行

- nightly.yml の `workflow_dispatch` で手動再実行可能（seeds 入力は任意）
- cron での再実行を待つ必要はない

### main-guard について

- main-guard は「検出」のみであり、ロールバック操作は存在しない
- main の状態を戻すには revert PR を使用する
