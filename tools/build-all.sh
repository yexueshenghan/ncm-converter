#!/bin/bash
# 生成图标并打包 macOS dmg + Windows exe
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$HOME/.local/node/bin:$PATH"

echo "==> 生成图标"
swiftc -O tools/gen_icon.swift -o /tmp/ncm-gen-icon
/tmp/ncm-gen-icon build/icon-master.png

rm -rf build/icon.iconset build/ico-src
mkdir -p build/icon.iconset build/ico-src
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" build/icon-master.png --out "build/icon.iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" build/icon-master.png --out "build/icon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns build/icon.iconset -o build/icon.icns

for size in 16 24 32 48 64 128 256; do
  sips -z "$size" "$size" build/icon-master.png --out "build/ico-src/icon-${size}.png" >/dev/null
done
python3 tools/make_ico.py \
  build/ico-src/icon-16.png build/ico-src/icon-24.png build/ico-src/icon-32.png \
  build/ico-src/icon-48.png build/ico-src/icon-64.png build/ico-src/icon-128.png \
  build/ico-src/icon-256.png build/icon.ico

echo "==> 打包 macOS"
npx electron-builder --mac --arm64 --publish never
npx electron-builder --mac --x64 --publish never

echo "==> 打包 Windows"
npx electron-builder --win --x64 --publish never

echo "==> 完成"
ls -lh dist/*.dmg dist/*.exe 2>/dev/null || true
