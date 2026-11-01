'use strict';

const fs = require('fs');
const path = require('path');

const { readNcm } = require('./ncm');
const { writeTags } = require('./tags');
const { flacToMp3 } = require('./transcode');

function uniquePath(target) {
  if (!fs.existsSync(target)) return target;
  const ext = path.extname(target);
  const base = target.slice(0, target.length - ext.length);
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
}

function artistOf(meta) {
  if (!meta || !Array.isArray(meta.artist)) return '';
  return meta.artist
    .map((item) => (Array.isArray(item) ? item[0] : item))
    .filter(Boolean)
    .join('/');
}

/** 只解析头部，快速判断这批文件里有没有无损音源。 */
function probe(input) {
  const { format, meta } = readNcm(fs.readFileSync(input), { audio: false });
  return { format, title: (meta && meta.musicName) || '' };
}

/**
 * @param {string} input ncm 文件路径
 * @param {{outDir?: string, flacOutput?: 'flac'|'mp3', ffmpegPath?: string}} options
 */
async function convert(input, options = {}) {
  const buffer = fs.readFileSync(input);
  const { audio, format, meta, image } = readNcm(buffer);

  const title = (meta && meta.musicName) || path.basename(input, path.extname(input));
  const wantingMp3 = format === 'flac' && options.flacOutput === 'mp3';
  const outFormat = wantingMp3 ? 'mp3' : format;

  const tags = {
    title,
    artist: artistOf(meta),
    album: (meta && meta.album) || '',
    image,
  };
  let payload = audio;
  if (wantingMp3) {
    payload = await flacToMp3(audio, { bitrate: '320k', ffmpegPath: options.ffmpegPath });
  }

  const outDir = options.outDir || path.dirname(input);
  fs.mkdirSync(outDir, { recursive: true });
  const output = uniquePath(
    path.join(outDir, `${path.basename(input, path.extname(input))}.${outFormat}`)
  );

  const tagged = writeTags(payload, { format: outFormat, ...tags });
  fs.writeFileSync(output, tagged);

  return {
    input,
    output,
    format: outFormat,
    sourceFormat: format,
    title,
    artist: tags.artist,
    album: tags.album,
    duration: meta && meta.duration ? Math.round(meta.duration / 1000) : null,
    bitrate: outFormat === 'mp3' && wantingMp3 ? 320000 : (meta && meta.bitrate) || null,
    size: tagged.length,
  };
}

module.exports = { convert, probe };
