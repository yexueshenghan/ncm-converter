'use strict';

// 测试用：把任意音频（FLAC/MP3）封装成 NCM 文件，用于验证解密和转换流程。
// 只是 readNcm 的逆过程，产出文件仅供本地测试。

const crypto = require('crypto');
const fs = require('fs');

const CORE_KEY = Buffer.from('687A4852416D736F356B496E62617857', 'hex');
const META_KEY = Buffer.from('2331346C6A6B5F215C5D2630553C2728', 'hex');

function aes128EcbEncrypt(data, key) {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

function u32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

function makeNcm({ audio, meta, cover = null }) {
  const key = crypto.randomBytes(16);

  const keyPlain = Buffer.concat([Buffer.from('neteasecloudmusic', 'utf8'), key]);
  const keyBlock = aes128EcbEncrypt(keyPlain, CORE_KEY);
  for (let i = 0; i < keyBlock.length; i++) keyBlock[i] ^= 0x64;

  const metaPlain = Buffer.from(`music:${JSON.stringify(meta)}`, 'utf8');
  const metaBlock = Buffer.from(
    `163 key(Don't modify):${aes128EcbEncrypt(metaPlain, META_KEY).toString('base64')}`,
    'utf8'
  );
  for (let i = 0; i < metaBlock.length; i++) metaBlock[i] ^= 0x63;

  // 与解密端相同的 RC4 编排
  const sbox = new Uint8Array(256);
  for (let i = 0; i < 256; i++) sbox[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + sbox[i] + key[i % key.length]) & 0xff;
    const tmp = sbox[i];
    sbox[i] = sbox[j];
    sbox[j] = tmp;
  }
  const stream = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    stream[i] = sbox[(sbox[i] + sbox[(i + sbox[i]) & 0xff]) & 0xff];
  }
  const encrypted = Buffer.from(audio);
  for (let i = 0; i < encrypted.length; i++) encrypted[i] ^= stream[(i + 1) & 0xff];

  const coverSize = cover ? cover.length : 0;
  const parts = [
    Buffer.from('CTENFDAM', 'ascii'),
    Buffer.alloc(2),
    u32(keyBlock.length),
    keyBlock,
    u32(metaBlock.length),
    metaBlock,
    Buffer.alloc(5),
    u32(coverSize),
    u32(coverSize),
    cover || Buffer.alloc(0),
    encrypted,
  ];
  return Buffer.concat(parts);
}

if (require.main === module) {
  const [input, output, format] = process.argv.slice(2);
  if (!input || !output) {
    console.log('用法: node tools/make-test-ncm.js <音频文件> <输出.ncm> [flac|mp3]');
    process.exit(1);
  }
  const audio = fs.readFileSync(input);
  const kind = format || (input.toLowerCase().endsWith('.flac') ? 'flac' : 'mp3');
  fs.writeFileSync(
    output,
    makeNcm({
      audio,
      meta: {
        musicName: '测试曲目',
        album: '测试专辑',
        artist: [['测试歌手', '1']],
        format: kind,
        bitrate: kind === 'flac' ? 1000000 : 320000,
        duration: 1000,
      },
    })
  );
  console.log(`wrote ${output} (${kind}, ${audio.length} bytes audio)`);
}

module.exports = { makeNcm };
