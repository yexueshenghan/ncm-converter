'use strict';

// 用已知正确的输出来校验解密实现：解密后的音频字节必须与参考文件（去掉 ID3 标签后）逐字节一致。

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const os = require('os');

const { readNcm } = require('../src/ncm');

const SAMPLE =
  process.argv[2] || path.join(os.homedir(), 'Music', '网易云音乐', '陈奕迅 - 单车.ncm');
const REFERENCE =
  process.argv[3] || path.join(os.homedir(), 'Music', '网易云音乐', '陈奕迅 - 单车.mp3');

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

function stripId3(mp3) {
  if (mp3.toString('ascii', 0, 3) !== 'ID3') return mp3;
  const size =
    ((mp3[6] & 0x7f) << 21) | ((mp3[7] & 0x7f) << 14) | ((mp3[8] & 0x7f) << 7) | (mp3[9] & 0x7f);
  const footer = mp3[5] & 0x10 ? 10 : 0;
  return mp3.subarray(10 + size + footer);
}

const buf = fs.readFileSync(SAMPLE);
const result = readNcm(buf);

console.log('format      :', result.format);
console.log('audio bytes :', result.audio.length);
console.log('md5         :', md5(result.audio));
console.log('meta        :', JSON.stringify(result.meta && {
  musicName: result.meta.musicName,
  album: result.meta.album,
  artist: result.meta.artist,
  bitrate: result.meta.bitrate,
  duration: result.meta.duration,
}));
console.log('cover bytes :', result.image ? result.image.length : 0);

if (fs.existsSync(REFERENCE)) {
  const reference = stripId3(fs.readFileSync(REFERENCE));
  const same = md5(reference) === md5(result.audio);
  console.log('reference md5:', md5(reference));
  console.log(same ? 'MATCH ✅ 解密结果与参考文件一致' : 'MISMATCH ❌');
  if (!same) process.exitCode = 1;
} else {
  console.log('（没有参考文件，跳过比对）');
}
