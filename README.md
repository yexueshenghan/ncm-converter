# NCM Converter

把网易云音乐下载的 `.ncm` 加密文件在本地解密成普通 MP3 / FLAC 的桌面小工具。
图形界面，支持拖拽、批量、保留歌曲信息与封面。转换全程离线，不上传任何文件。

## 直接使用

- macOS：安装 `NCM Converter-1.0.0-arm64.dmg`（Apple Silicon）或 `-x64.dmg`（Intel），把 App 拖进「应用程序」。
- Windows：运行 `NCM-Converter-1.0.0-win-x64.exe`，绿色单文件，无需安装。

首次打开如果被系统拦下（应用未签名）：

- macOS：在「应用程序」里右键点 App → 打开；或执行
  `xattr -dr com.apple.quarantine "/Applications/NCM Converter.app"`
- Windows：在 SmartScreen 提示里点「更多信息」→「仍要运行」。

## 功能

- 拖拽或选择 `.ncm` 文件，支持整个文件夹递归添加
- 解密后保留标题 / 歌手 / 专辑标签，内嵌封面（NCM 里带封面时）
- 标准音质直接导出 MP3
- **遇到无损（FLAC）音源时会弹窗询问**：转成 MP3 320k（兼容性好、体积小），还是保留 FLAC（音质最好）
- 可选输出目录，重名文件自动加序号
- 转换完成后点击列表项可在文件管理器中定位

## 开发

```bash
# 需要 Node.js 18+
npm install
./tools/fetch-ffmpeg.sh   # 下载打包用的 ffmpeg 到 vendor/ffmpeg
npm start                 # 开发模式运行
```

## 打包

```bash
./tools/build-all.sh   # 生成图标并打包 macOS dmg + Windows exe
```

产物在 `dist/`：

- `NCM-Converter-1.0.0-arm64.dmg` / `-x64.dmg`
- `NCM-Converter-1.0.0-win-x64.exe`

Windows 包在 macOS 上交叉构建完成，不需要 Windows 机器（除非要代码签名）。

打包时会把对应平台的 ffmpeg 放进应用资源目录（`resources/ffmpeg/`），所以安装包会比不含转码时大 40~80 MB。

## 目录结构

```
main.js              Electron 主进程：窗口、文件对话框、转换调度
preload.js           受控的渲染进程桥接
src/ncm.js           NCM 格式解密（AES-128-ECB + RC4 变体流加密）
src/tags.js          MP3 的 ID3v2 标签 / FLAC 的 Vorbis Comment + PICTURE 写入
src/transcode.js     调用随包的 ffmpeg 把 FLAC 转成 MP3
src/converter.js     单文件转换流程
renderer/            界面（原生 HTML/CSS/JS，无前端框架）
vendor/ffmpeg/       打包用的 ffmpeg 二进制（tools/fetch-ffmpeg.sh 下载）
tools/gen_icon.swift 用 CoreGraphics 生成应用图标母版
tools/make_ico.py    PNG → Windows .ico
tools/make-test-ncm.js  把任意音频封装成 NCM，用于测试无损转换流程
tools/check-decrypt.js  用参考文件校验解密结果是否逐字节一致
```

## 说明

本工具只做格式转换，请仅用于处理自己合法获取的音乐文件，不要把转换结果用于分发。
