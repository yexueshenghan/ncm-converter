'use strict';

const NodeID3 = require('node-id3');

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf) {
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = buf[off + 1];
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    const segLength = buf.readUInt16BE(off + 2);
    if (isSOF) return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) };
    off += 2 + segLength;
  }
  return null;
}

function imageInfo(buf) {
  if (!buf) return null;
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) {
    return { mime: 'image/png', ...(pngSize(buf) || { width: 0, height: 0 }) };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) {
    return { mime: 'image/jpeg', ...(jpegSize(buf) || { width: 0, height: 0 }) };
  }
  return { mime: 'image/jpeg', width: 0, height: 0 };
}

function writeId3(audio, tags) {
  const id3 = {};
  if (tags.title) id3.title = tags.title;
  if (tags.artist) id3.artist = tags.artist;
  if (tags.album) id3.album = tags.album;
  if (tags.image) {
    const info = imageInfo(tags.image);
    id3.image = {
      mime: info.mime,
      type: { id: 3, name: 'front cover' },
      description: '',
      imageBuffer: tags.image,
    };
  }
  const buf = NodeID3.write(id3, audio);
  return buf && buf.length ? buf : audio;
}

function vorbisComment(tags) {
  const vendor = Buffer.from('NCM Converter', 'utf8');
  const comments = [];
  if (tags.title) comments.push(`TITLE=${tags.title}`);
  if (tags.artist) comments.push(`ARTIST=${tags.artist}`);
  if (tags.album) comments.push(`ALBUM=${tags.album}`);
  const parts = [];
  const head = Buffer.alloc(4);
  head.writeUInt32LE(vendor.length, 0);
  parts.push(head, vendor);
  const count = Buffer.alloc(4);
  count.writeUInt32LE(comments.length, 0);
  parts.push(count);
  for (const comment of comments) {
    const body = Buffer.from(comment, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(body.length, 0);
    parts.push(len, body);
  }
  return Buffer.concat(parts);
}

function pictureBlock(image) {
  const info = imageInfo(image);
  const mime = Buffer.from(info.mime, 'utf8');
  const desc = Buffer.alloc(0);
  const u32 = (n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n, 0);
    return b;
  };
  return Buffer.concat([
    u32(3), // 类型：front cover
    u32(mime.length),
    mime,
    u32(desc.length),
    desc,
    u32(info.width),
    u32(info.height),
    u32(24), // 位深
    u32(0), // 调色板颜色数
    u32(image.length),
    image,
  ]);
}

function writeFlac(audio, tags) {
  if (audio.length < 4 || audio.toString('ascii', 0, 4) !== 'fLaC') return audio;

  const blocks = [];
  let off = 4;
  let last = false;
  while (!last && off + 4 <= audio.length) {
    const header = audio[off];
    last = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const len = (audio[off + 1] << 16) | (audio[off + 2] << 8) | audio[off + 3];
    blocks.push({ type, data: audio.subarray(off + 4, off + 4 + len) });
    off += 4 + len;
  }
  const frames = audio.subarray(off);

  // 丢掉原有的注释和封面块，换成我们写的
  const kept = blocks.filter((b) => b.type !== 4 && b.type !== 6);
  kept.push({ type: 4, data: vorbisComment(tags) });
  if (tags.image) kept.push({ type: 6, data: pictureBlock(tags.image) });

  const parts = [Buffer.from('fLaC', 'ascii')];
  kept.forEach((block, index) => {
    const header = Buffer.alloc(4);
    header[0] = block.type | (index === kept.length - 1 ? 0x80 : 0);
    header.writeUIntBE(block.data.length, 1, 3);
    parts.push(header, Buffer.from(block.data));
  });
  parts.push(Buffer.from(frames));
  return Buffer.concat(parts);
}

function writeTags(audio, { format, ...tags }) {
  return format === 'flac' ? writeFlac(audio, tags) : writeId3(audio, tags);
}

module.exports = { writeTags };
