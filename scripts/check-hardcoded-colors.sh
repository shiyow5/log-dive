#!/usr/bin/env bash
# #96: src の .ts に 6桁の "#rrggbb" 色を直書きしない。色は src/ui/tokens.ts（CSS の --ld-*）から使う。
# コメント行（// / * / /*）は対象外。tokens.ts 自体は除外。
set -euo pipefail
cd "$(dirname "$0")/.."
hits=$(grep -rnE "#[0-9a-fA-F]{6}" src --include=*.ts | grep -v tokens | grep -vE "^[^:]+:[0-9]+:\s*(//|\*|/\*)" || true)
if [ -n "$hits" ]; then
  echo "ハードコード色が見つかりました。src/ui/tokens.ts のトークンを使ってください:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "ok: ハードコード色なし"
