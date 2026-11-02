# QA: テストの置き場所と判定チェックリスト

## 置き場所

| パス              | 中身                                                      |
| ----------------- | --------------------------------------------------------- |
| `tests/qa/`       | ゴールデン・BOT・データ検証など QA が書くテスト（Vitest） |
| `tests/fixtures/` | リプレイ・配置・注文などのフィクスチャ JSON               |
| `e2e/`            | Playwright                                                |

- 実装より先に書くテストは `it.todo` / `test.fixme` にして CI を緑に保つ。**各マイルストーンの判定時に、対象範囲の todo / fixme が 0 件**であることを確認する。
- PR の CI では e2e ジョブは `run-e2e` ラベルが付いたときだけ動く（`.github/workflows/ci.yml`）。e2e を触る PR には `run-e2e` を付ける。

## 判定の共通ルール（全マイルストーン）

1. main の CI 4ジョブ（format / lint / test / e2e）が緑
2. 対象の PR がすべて `Closes #N` 付き、実装者以外の 2 名 LGTM
3. S1・S2 の未解決が 0 件
4. 判定記録に **確認時刻（JST）・commit SHA・実行したコマンドと出力の要点** を書く

## 判定の手順（共通）

```sh
git fetch origin && git checkout --detach origin/main
git rev-parse HEAD                      # → 記録の commit SHA
TZ=Asia/Tokyo date '+%F %T'             # → 記録の確認時刻
gh run list --branch main --workflow CI --limit 1   # main の最新 CI が success か
npm ci
npm run format:check && npm run lint && npm run typecheck
npm test                                 # Vitest
npm run build && npm run test:e2e        # Playwright
grep -rnE --include='*.ts' --include='*.tsx' 'it\.todo|test\.fixme|it\.skip|test\.skip|describe\.skip' tests e2e   # テストソースだけを見る。対象範囲で 0 件か
```

## 縦切りの判定（11/04 21:00〜、23:00 報告。qa-plan-v3 §3-1）

対象: 1部屋を歩けて、バグ1種と戦える。

| #   | 合格の条件                                                                                          | 観点                | 確かめ方                                                            | 合否 |
| --- | --------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------- | ---- |
| A1  | `?seed=` 固定で起動 → 1部屋を移動 → バグ1種と戦闘 → 撃破か失敗で終わる。コンソールエラー 0          | LD-20（縮小版）     | `npm run test:e2e` の smoke（縦切り）が pass、fixme なし            |      |
| A2  | 同じ seed＋同じ行動列 → 同じ stateHash（縦切りのリプレイ 1 本がゴールデン）                         | LD-01               | `npx vitest run tests/qa/golden.test.ts` が pass、todo なし         |      |
| A3  | 隣でない部屋への move・CPU 不足で例外を出さず `lastError`、state は不変                             | LD-14・LD-04 の一部 | 該当の Vitest が pass                                               |      |
| A4  | 合法手ランダム BOT 200 seed: 例外 0・上限ターンで必ず終わる・HP がマイナスにならない（1部屋が対象） | LD-15               | `QA_BOT_SEEDS=200 npx vitest run tests/qa/` が pass。所要時間も記録 |      |

縦切りでは判定しないもの: 階段・宝箱・スキルの大半・3階。

### 記録テンプレート

```
確認時刻(JST):
commit SHA (main):
main CI run: <URL> / 結果:
A1: 合否 / コマンド / 出力の要点
A2:
A3:
A4:
残っている todo/fixme（縦切り範囲）: 件数
S1・S2 未解決: 件数
```
