#!/usr/bin/env python3
"""把若干 PNG 打包成 Windows .ico（每个尺寸内嵌 PNG 数据）。"""
import struct
import sys


def build_ico(png_paths, out_path):
    images = []
    for path in png_paths:
        with open(path, 'rb') as handle:
            data = handle.read()
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            raise SystemExit(f'{path} 不是 PNG')
        width = struct.unpack('>I', data[16:20])[0]
        height = struct.unpack('>I', data[20:24])[0]
        images.append((width, height, data))

    header = struct.pack('<HHH', 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b''
    payload = b''
    for width, height, data in images:
        entries += struct.pack(
            '<BBBBHHII',
            0 if width >= 256 else width,
            0 if height >= 256 else height,
            0,
            0,
            1,
            32,
            len(data),
            offset,
        )
        payload += data
        offset += len(data)

    with open(out_path, 'wb') as handle:
        handle.write(header + entries + payload)
    print(f'wrote {out_path} ({len(images)} images)')


if __name__ == '__main__':
    build_ico(sys.argv[1:-1], sys.argv[-1])
