#!/usr/bin/env python3
"""Downscale embedded GLB textures and rebuild the binary deterministically."""

from __future__ import annotations

import argparse
import io
import json
import struct
from pathlib import Path

from PIL import Image


GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def align4(value: int) -> int:
    return (value + 3) & ~3


def parse_glb(path: Path) -> tuple[dict, bytes]:
    source = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<III", source, 0)
    if magic != GLB_MAGIC or version != 2 or total_length != len(source):
        raise ValueError("Expected a complete glTF 2.0 binary file.")

    document = None
    binary = None
    offset = 12
    while offset < len(source):
        chunk_length, chunk_type = struct.unpack_from("<II", source, offset)
        offset += 8
        chunk = source[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == JSON_CHUNK:
            document = json.loads(chunk.rstrip(b" \x00").decode("utf-8"))
        elif chunk_type == BIN_CHUNK:
            binary = chunk
    if document is None or binary is None:
        raise ValueError("The model must contain JSON and BIN chunks.")
    return document, binary


def image_bytes(document: dict, binary: bytes, image: dict) -> bytes:
    view = document["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    return binary[start : start + view["byteLength"]]


def resize_image(source: bytes, mime_type: str, max_dimension: int, jpeg_quality: int) -> tuple[bytes, tuple[int, int], tuple[int, int]]:
    with Image.open(io.BytesIO(source)) as image:
        image.load()
        original_size = image.size
        if max(original_size) <= max_dimension:
            return source, original_size, original_size

        scale = max_dimension / max(original_size)
        target_size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        resized = image.resize(target_size, Image.Resampling.LANCZOS)
        output = io.BytesIO()
        if mime_type == "image/jpeg":
            if resized.mode not in ("RGB", "L"):
                resized = resized.convert("RGB")
            resized.save(output, format="JPEG", quality=jpeg_quality, optimize=True, progressive=True)
        elif mime_type == "image/png":
            resized.save(output, format="PNG", optimize=True, compress_level=9)
        else:
            raise ValueError(f"Unsupported embedded image type: {mime_type}")
        return output.getvalue(), original_size, target_size


def material_image_sources(document: dict, material_names: set[str]) -> set[int]:
    selected_materials = {
        index for index, material in enumerate(document.get("materials", [])) if material.get("name") in material_names
    }
    source_users: dict[int, set[int]] = {}
    for material_index, material in enumerate(document.get("materials", [])):
        texture_indices: set[int] = set()

        def collect(value: object, key: str = "") -> None:
            if isinstance(value, dict):
                if key.endswith("Texture") and isinstance(value.get("index"), int):
                    texture_indices.add(value["index"])
                for child_key, child in value.items():
                    collect(child, child_key)
            elif isinstance(value, list):
                for child in value:
                    collect(child, key)

        collect(material)
        for texture_index in texture_indices:
            texture = document.get("textures", [])[texture_index]
            source_index = texture.get("source")
            if isinstance(source_index, int):
                source_users.setdefault(source_index, set()).add(material_index)

    return {
        source_index
        for source_index, users in source_users.items()
        if users and users.issubset(selected_materials)
    }


def rebuild_glb(document: dict, binary: bytes, replacements: dict[int, bytes]) -> bytes:
    parts: list[bytes] = []
    output_offset = 0
    for index, view in enumerate(document["bufferViews"]):
        start = view.get("byteOffset", 0)
        source = replacements.get(index, binary[start : start + view["byteLength"]])
        aligned_offset = align4(output_offset)
        if aligned_offset > output_offset:
            parts.append(bytes(aligned_offset - output_offset))
        view["byteOffset"] = aligned_offset
        view["byteLength"] = len(source)
        parts.append(source)
        output_offset = aligned_offset + len(source)

    binary_output = b"".join(parts) + bytes(align4(output_offset) - output_offset)
    document["buffers"][0]["byteLength"] = len(binary_output)

    json_source = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_output = json_source + (b" " * (align4(len(json_source)) - len(json_source)))
    total_length = 12 + 8 + len(json_output) + 8 + len(binary_output)
    return b"".join(
        [
            struct.pack("<III", GLB_MAGIC, 2, total_length),
            struct.pack("<II", len(json_output), JSON_CHUNK),
            json_output,
            struct.pack("<II", len(binary_output), BIN_CHUNK),
            binary_output,
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-dimension", type=int, default=512)
    parser.add_argument("--jpeg-quality", type=int, default=84)
    parser.add_argument(
        "--collapse-material",
        action="append",
        default=[],
        help="Collapse images used exclusively by this replaced-at-runtime material to one pixel.",
    )
    args = parser.parse_args()
    if args.max_dimension < 64:
        raise ValueError("max dimension must be at least 64")
    if args.input.resolve() == args.output.resolve():
        raise ValueError("input and output paths must differ")

    document, binary = parse_glb(args.input)
    collapsed_sources = material_image_sources(document, set(args.collapse_material))
    replacements: dict[int, bytes] = {}
    decoded_before = 0
    decoded_after = 0
    resized_count = 0
    collapsed_count = 0
    for image_index, image in enumerate(document.get("images", [])):
        source = image_bytes(document, binary, image)
        image_max_dimension = 1 if image_index in collapsed_sources else args.max_dimension
        replacement, original_size, target_size = resize_image(
            source,
            image.get("mimeType", ""),
            image_max_dimension,
            args.jpeg_quality,
        )
        decoded_before += original_size[0] * original_size[1] * 4
        decoded_after += target_size[0] * target_size[1] * 4
        if target_size != original_size:
            replacements[image["bufferView"]] = replacement
            resized_count += 1
            if image_index in collapsed_sources:
                collapsed_count += 1

    output = rebuild_glb(document, binary, replacements)
    args.output.write_bytes(output)
    print(
        json.dumps(
            {
                "images": len(document.get("images", [])),
                "resized": resized_count,
                "collapsed": collapsed_count,
                "collapsedMaterials": args.collapse_material,
                "maxDimension": args.max_dimension,
                "fileBytesBefore": args.input.stat().st_size,
                "fileBytesAfter": len(output),
                "decodedRgbaBytesBefore": decoded_before,
                "decodedRgbaBytesAfter": decoded_after,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
