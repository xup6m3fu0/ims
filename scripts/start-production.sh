#!/usr/bin/env bash
# 在專案根目錄以外執行時，請先 cd 到 backend 再執行 node，或由 launchd 設定 WorkingDirectory。
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR/backend"
exec node dist/index.js
