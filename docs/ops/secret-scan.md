# Secret Scan (gitleaks) 運用手順

## gitleaks ワークフロー

- ファイル: `.github/workflows/gitleaks.yml`
- トリガー: push (main)、pull_request (main)、workflow_dispatch
- スキャン範囲: PR時は追加コミットのみ、push/手動時は全履歴（`fetch-depth: 0`）
- gitleaks v8.30.1 をバージョン固定 + SHA256 検証で取得（サードパーティ Action 不使用）
- 検出値は `--redact` でログに出力しない

## 検出時の対処手順

gitleaks でシークレット（API キー、トークン、秘密鍵など）が検出された場合:

1. **鍵・トークンの失効・ローテーション（最優先）**
   - 影響のあるサービスで即座に無効化し、新しい鍵を発行・設定し直す
   - 検出された値は PR・チャネル・ログ・メッセージのどこにも記載せず、値そのものの確認が必要な場合は直接リポジトリ内で確認する

2. **履歴対応**
   - 誤検知でない場合、 git history から当該値を除去する
   - 方法: `git filter-branch`、`git filter-repo`、または BFG Repo-Cleaner 等を使用
   - **force push の実施には必ず承認を得ること**（関係者への事前連絡を含む）
   - force push 後は関連する全環境で鍵の再設定が必要

## 誤検知の対応

誤検知（false positive）が発生した場合:

1. `.gitleaksignore` ファイルに fingerprint を記載して除外する
2. 各エントリには以下の情報を明記すること:
   - fingerprint: gitleaks が出力する識別子（`<commit>:<file>:<rule>:<line>` 形式）。**接頭辞を付けず、1行に fingerprint だけを書く**
   - reason: 直前の `#` コメント行に、なぜ誤検知か（例: テストデータ、ドキュメント内のサンプル値等）
3. `.gitleaksignore` への変更はレビュー必須（誤った除外により本物のシークレットが放置されないよう）

### `.gitleaksignore` のフォーマット例

```
# reason: unit test fixture (fake API key), never used in production
0123abcd4567ef89:tests/fixtures/api.ts:generic-api-key:12
```

## pre-commitフックの導入手順

ローカルでのシークレット混入を未然に防ぐため、pre-commit を導入する場合は以下の手順を踏む:

1. パッケージのインストール

   ```bash
   pip install pre-commit
   ```

2. `.pre-commit-config.yaml` の作成（参考）

   ```yaml
   repos:
     - repo: https://github.com/gitleaks/gitleaks
       rev: v8.30.1
       hooks:
         - id: gitleaks
   ```

3. pre-commit フックのインストール

   ```bash
   pre-commit install
   ```

4. 全履歴の一発チェック（任意）
   ```bash
   gitleaks detect --source . -v --redact
   ```

> **注意**: pre-commit は予防策であり、CI 上の gitleaks ワークフローに代わるものではありません。両方を併用する。

## required checks 案

gitleaks ワークフローを GitHub Settings の **Branch Protection Rules** で required status checks に追加する案。

### 実際のチェック名

gitleaks.yml のジョブ名は `gitleaks`（`jobs.gitleaks.name`）のため、チェック名は **`gitleaks`** となる（ワークフロー名 "Secret Scan (gitleaks)" ではない）。

### 適用手順（設定変更）

1. リポジトリ > Settings > Branches > Branch protection rules
2. 既存のルール（`main` ブランチ用）を編集、または新規作成
3. "Require a pull request before merging" 既存設定を維持した上で
4. **"Require status checks to pass before merging"** を有効化
5. "Status checks" の検索ボックスで `gitleaks` を検索して追加
6. "Require branches to be up to date before merging" は必要に応じて有効化
7. 保存

### 影響

- gitleaks でシークレットが検出された場合、main への PR マージがブロックされる
- CI 実行時間がやや増える（通常数秒〜十数秒）
- gitleaks ワークフローが削除・無効化されている間はチェックが報告されないためマージがブロックされる

### 戻し方

- Settings > Branches で該当ルールを編集し、status checks から `gitleaks` を削除するのみで元に戻る
- gitleaks workflow を削除した場合も同様に除去可能

### 注意事項

- **本設定の変更はしよをさんの承認（東雲さん経由）を得てから実施すること**
- **前提: このリポジトリは Private かつ GitHub Free のため、現状では branch protection / required status checks は強制されない**（CONTRIBUTING.md 参照）。本案は Public 化または有料プランへの移行後に適用する。それまでは CI の gitleaks 結果をレビュー時に目視確認する
- 誤検知が増える場合は `.gitleaksignore` に対応し、必要な分だけ除外する
