#!/bin/bash
# 用 GitHub Personal Access Token 创建仓库、推送代码，并把安装包挂到 Release 上。
#
#   GH_TOKEN=ghp_xxx ./tools/publish.sh            # 私有仓库
#   GH_TOKEN=ghp_xxx VISIBILITY=public ./tools/publish.sh
#   GH_TOKEN=ghp_xxx UPLOAD_ASSETS=0 ./tools/publish.sh   # 只推代码，不传安装包
#
# Token 需要 repo 权限（classic）或 Contents+Administration 权限（fine-grained）。
# 网络慢时先开代理，并在运行前 export https_proxy=... http_proxy=...（命令行工具不会自动用系统代理）。
set -euo pipefail

: "${GH_TOKEN:?请先设置 GH_TOKEN 环境变量，例如 GH_TOKEN=ghp_xxx ./tools/publish.sh}"
cd "$(dirname "$0")/.."

REPO_NAME="${REPO_NAME:-ncm-converter}"
VISIBILITY="${VISIBILITY:-private}"
UPLOAD_ASSETS="${UPLOAD_ASSETS:-1}"
TAG="${TAG:-v1.0.0}"
API="https://api.github.com"
UPLOADS="https://uploads.github.com"

json_get() {
  python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)"
}

LOGIN=$(curl -sS -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  "$API/user" | json_get "['login']")
echo "==> 账号：$LOGIN"

if [ "$VISIBILITY" = "public" ]; then PRIVATE=false; else PRIVATE=true; fi

CODE=$(curl -sS -o /tmp/gh-repo.json -w '%{http_code}' \
  -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  -X POST "$API/user/repos" \
  -d "{\"name\":\"$REPO_NAME\",\"private\":$PRIVATE,\"description\":\"网易云音乐 NCM 文件本地转 MP3/FLAC 的桌面工具\"}")
case "$CODE" in
  201) echo "==> 已创建仓库 $LOGIN/$REPO_NAME（$VISIBILITY）" ;;
  422) echo "==> 仓库 $LOGIN/$REPO_NAME 已存在，继续推送" ;;
  *) echo "创建仓库失败："; cat /tmp/gh-repo.json; exit 1 ;;
esac

echo "==> 推送代码"
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$LOGIN/$REPO_NAME.git"
if ! git push "https://x-access-token:$GH_TOKEN@github.com/$LOGIN/$REPO_NAME.git" main:main 2>&1 \
  | sed 's#x-access-token:[^@]*@#x-access-token:***@#g'; then
  echo "推送失败（上面的日志里的 token 已打码）"
  exit 1
fi
git branch --set-upstream-to="origin/main" main >/dev/null 2>&1 || true

if [ "$UPLOAD_ASSETS" = "0" ]; then
  echo "==> 跳过安装包上传"
  exit 0
fi

echo "==> 创建 Release $TAG"
curl -sS -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  -X POST "$API/repos/$LOGIN/$REPO_NAME/releases" \
  -d "{\"tag_name\":\"$TAG\",\"name\":\"$TAG\",\"body\":\"macOS：arm64 / x64 dmg；Windows：x64 单文件 exe。应用未签名，首次打开需手动放行。\"}" \
  -o /tmp/gh-release.json
RELEASE_ID=$(json_get "['id']" < /tmp/gh-release.json)
echo "    release id=$RELEASE_ID"

shopt -s nullglob
for FILE in dist/*.dmg dist/*.exe; do
  NAME=$(basename "$FILE")
  echo "==> 上传 $NAME ($(du -h "$FILE" | cut -f1))"
  CODE=$(curl --http1.1 -sS --retry 5 --retry-delay 3 --retry-all-errors \
    -o /tmp/gh-asset.json -w '%{http_code}' \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@$FILE" \
    "$UPLOADS/repos/$LOGIN/$REPO_NAME/releases/$RELEASE_ID/assets?name=$NAME")
  SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE")
  if [ "$CODE" != "201" ]; then
    echo "   上传失败（HTTP $CODE）："; cat /tmp/gh-asset.json; echo; exit 1
  fi
  PYTHONIOENCODING=utf-8 python3 - "$SIZE" <<'PY'
import json, sys
size = int(sys.argv[1])
d = json.load(open('/tmp/gh-asset.json'))
if d.get('size') == size:
    print('   -> 已上传，大小校验一致', d.get('browser_download_url'))
else:
    print(f"   -> 大小不一致：本地 {size}，远端 {d.get('size')}")
    sys.exit(1)
PY
done

echo "==> 完成：https://github.com/$LOGIN/$REPO_NAME"
