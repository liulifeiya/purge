#!/usr/bin/env bash
# 用法: ./push.sh <PAT>   （PAT 需 repo 权限；推完自动把 remote 恢复成干净 URL）
set -euo pipefail
PAT="${1:?用法: ./push.sh <PAT>}"
USER_NAME="liulifeiya"
REMOTE="purge"
URL="https://${USER_NAME}:${PAT}@github.com/${USER_NAME}/purge.git"
cd "$(dirname "$0")"
git remote set-url origin "$URL"
trap 'git remote set-url origin "https://github.com/${USER_NAME}/purge.git"' EXIT
git push -u origin main
echo "--- 远端 refs ---"
git ls-remote origin
