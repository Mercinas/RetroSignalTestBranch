#!/usr/bin/env python3
"""Downsample a Radiance RGBE environment map without converting it to SDR."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path


RESOLUTION = re.compile(rb"-Y\s+(\d+)\s+\+X\s+(\d+)")


def decode_channel(source: bytes, offset: int, width: int) -> tuple[bytes, int]:
    output = bytearray()
    while len(output) < width:
        count = source[offset]
        offset += 1
        if count > 128:
            run_length = count - 128
            output.extend([source[offset]] * run_length)
            offset += 1
        else:
            output.extend(source[offset : offset + count])
            offset += count
    if len(output) != width:
        raise ValueError("Invalid RGBE scanline channel length.")
    return bytes(output), offset


def decode_scanline(source: bytes, offset: int, width: int) -> tuple[bytes, int]:
    if source[offset : offset + 2] != b"\x02\x02":
        raise ValueError("Only modern Radiance RLE scanlines are supported.")
    encoded_width = int.from_bytes(source[offset + 2 : offset + 4], "big")
    if encoded_width != width:
        raise ValueError("RGBE scanline width does not match the header.")
    offset += 4
    channels = []
    for _ in range(4):
        channel, offset = decode_channel(source, offset, width)
        channels.append(channel)
    pixels = bytearray(width * 4)
    for x in range(width):
        for channel in range(4):
            pixels[x * 4 + channel] = channels[channel][x]
    return bytes(pixels), offset


def rgbe_to_rgb(pixel: bytes) -> tuple[float, float, float]:
    if pixel[3] == 0:
        return 0.0, 0.0, 0.0
    scale = math.ldexp(1.0, pixel[3] - (128 + 8))
    return pixel[0] * scale, pixel[1] * scale, pixel[2] * scale


def rgb_to_rgbe(red: float, green: float, blue: float) -> bytes:
    peak = max(red, green, blue)
    if peak < 1e-32:
        return b"\x00\x00\x00\x00"
    mantissa, exponent = math.frexp(peak)
    scale = mantissa * 256.0 / peak
    return bytes(
        (
            min(255, max(0, int(red * scale))),
            min(255, max(0, int(green * scale))),
            min(255, max(0, int(blue * scale))),
            min(255, max(0, exponent + 128)),
        )
    )


def encode_channel(values: bytes) -> bytes:
    output = bytearray()
    for index in range(0, len(values), 128):
        raw = values[index : index + 128]
        output.append(len(raw))
        output.extend(raw)
    return bytes(output)


def encode_scanline(pixels: bytes, width: int) -> bytes:
    output = bytearray((2, 2, width >> 8, width & 255))
    for channel in range(4):
        output.extend(encode_channel(bytes(pixels[x * 4 + channel] for x in range(width))))
    return bytes(output)


def downsample(source_path: Path, output_path: Path, factor: int) -> dict[str, int]:
    source = source_path.read_bytes()
    header_end = source.find(b"\n\n")
    if header_end < 0:
        raise ValueError("Radiance header terminator was not found.")
    resolution_start = header_end + 2
    resolution_end = source.find(b"\n", resolution_start)
    match = RESOLUTION.fullmatch(source[resolution_start:resolution_end])
    if not match:
        raise ValueError("Expected a -Y height +X width Radiance map.")
    height, width = (int(value) for value in match.groups())
    if factor < 2 or width % factor or height % factor:
        raise ValueError("Factor must evenly divide both source dimensions and be at least two.")

    scanlines = []
    offset = resolution_end + 1
    for _ in range(height):
        scanline, offset = decode_scanline(source, offset, width)
        scanlines.append(scanline)
    if offset != len(source):
        raise ValueError("Unexpected trailing bytes after RGBE pixel data.")

    output_width = width // factor
    output_height = height // factor
    output_rows = []
    sample_count = factor * factor
    for target_y in range(output_height):
        row = bytearray()
        for target_x in range(output_width):
            total = [0.0, 0.0, 0.0]
            for source_y in range(target_y * factor, (target_y + 1) * factor):
                scanline = scanlines[source_y]
                for source_x in range(target_x * factor, (target_x + 1) * factor):
                    start = source_x * 4
                    rgb = rgbe_to_rgb(scanline[start : start + 4])
                    for channel in range(3):
                        total[channel] += rgb[channel]
            row.extend(rgb_to_rgbe(*(value / sample_count for value in total)))
        output_rows.append(encode_scanline(bytes(row), output_width))

    resolution = f"-Y {output_height} +X {output_width}\n".encode("ascii")
    output = source[:resolution_start] + resolution + b"".join(output_rows)
    output_path.write_bytes(output)
    return {
        "widthBefore": width,
        "heightBefore": height,
        "widthAfter": output_width,
        "heightAfter": output_height,
        "fileBytesBefore": len(source),
        "fileBytesAfter": len(output),
        "decodedRgbBytesBefore": width * height * 3 * 2,
        "decodedRgbBytesAfter": output_width * output_height * 3 * 2,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--factor", type=int, default=2)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        raise ValueError("Input and output paths must differ.")
    print(json.dumps(downsample(args.input, args.output, args.factor), indent=2))


if __name__ == "__main__":
    main()
