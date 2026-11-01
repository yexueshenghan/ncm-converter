#!/bin/bash
# 下载打包要用的 ffmpeg（三个平台），放到 vendor/ffmpeg 下
set -euo pipefail

cd "$(dirname "$0")/.."
BASE="https://registry.npmmirror.com/-/binary/ffmpeg-static/b6.1.1"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch() {
  local remote="$1" dir="$2" output="$3"
  echo "==> $dir"
  curl -sSL --retry 3 -o "$TMP/$remote.gz" "$BASE/ffmpeg-$remote.gz"
  mkdir -p "vendor/ffmpeg/$dir"
  gunzip -c "$TMP/$remote.gz" > "vendor/ffmpeg/$dir/$output"
  chmod +x "vendor/ffmpeg/$dir/$output"
}

fetch darwin-arm64 mac-arm64 ffmpeg
fetch darwin-x64 mac-x64 ffmpeg
fetch win32-x64 win-x64 ffmpeg.exe

ls -lh vendor/ffmpeg/*/*
