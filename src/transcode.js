'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** 打包后 ffmpeg 在 resources/ffmpeg 下，开发时用 vendor 目录里对应平台的版本。 */
function resolveFfmpeg() {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'ffmpeg', exe))) {
    return path.join(process.resourcesPath, 'ffmpeg', exe);
  }
  const local = path.join(
    __dirname,
    '..',
    'vendor',
    'ffmpeg',
    `${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`,
    exe
  );
  if (fs.existsSync(local)) return local;
  return null;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 退出码 ${code}：${stderr.split('\n').slice(-3).join(' ')}`));
    });
  });
}

/**
 * 把 FLAC 音频转成 MP3（不写标签，标签由调用方写入）。
 * @param {Buffer} flac 原始 FLAC 数据
 * @param {{bitrate?: string, ffmpegPath?: string}} options
 * @returns {Promise<Buffer>} MP3 数据
 */
async function flacToMp3(flac, options = {}) {
  const ffmpeg = options.ffmpegPath || resolveFfmpeg();
  if (!ffmpeg) throw new Error('找不到 ffmpeg，无法把无损音源转成 MP3');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncm-flac-'));
  const input = path.join(dir, 'input.flac');
  const output = path.join(dir, 'output.mp3');
  try {
    fs.writeFileSync(input, flac);
    await run(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input,
      '-vn',
      '-map_metadata',
      '-1',
      '-c:a',
      'libmp3lame',
      '-b:a',
      options.bitrate || '320k',
      '-f',
      'mp3',
      output,
    ]);
    return fs.readFileSync(output);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { flacToMp3, resolveFfmpeg };
