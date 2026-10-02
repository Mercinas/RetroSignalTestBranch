import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const GLB_MAGIC = 0x46546c67;
const NEUTRAL_IMAGES = new Map([
  ["Base_baseColor", [255, 255, 255]],
  ["Base_normal", [128, 128, 255]],
  ["Base_metallicRoughness", [255, 220, 0]],
  ["baseBack_baseColor", [255, 255, 255]],
  ["baseBack_metallicRoughness", [255, 220, 0]],
]);

function align4(value) {
  return (value + 3) & ~3;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return result;
}

function solidPng(red, green, blue) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.from([0, red, green, blue, 255]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function parseGlb(path) {
  const file = readFileSync(path);
  if (file.readUInt32LE(0) !== GLB_MAGIC || file.readUInt32LE(4) !== 2) throw new Error("Expected a glTF 2.0 binary file.");
  let offset = 12;
  let json = null;
  let binary = null;
  while (offset < file.length) {
    const length = file.readUInt32LE(offset);
    const type = file.readUInt32LE(offset + 4);
    const content = file.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(content.toString("utf8").trimEnd());
    if (type === BIN_CHUNK) binary = content;
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error("The model must contain JSON and BIN chunks.");
  return { json, binary };
}

function imageBytes(document, binary, image) {
  const view = document.bufferViews[image.bufferView];
  return binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
}

function extractImages(document, binary, directory) {
  mkdirSync(directory, { recursive: true });
  document.images.forEach((image, index) => {
    const extension = image.mimeType === "image/jpeg" ? "jpg" : "png";
    const safeName = String(image.name || `image-${index}`).replace(/[^a-z0-9_-]/gi, "_");
    writeFileSync(join(directory, `${String(index).padStart(2, "0")}-${safeName}.${extension}`), imageBytes(document, binary, image));
  });
}

function rebuild(document, binary) {
  for (const image of document.images) {
    if (NEUTRAL_IMAGES.has(image.name)) image.mimeType = "image/png";
  }
  const neutralViews = new Map(
    document.images
      .filter((image) => NEUTRAL_IMAGES.has(image.name))
      .map((image) => [image.bufferView, solidPng(...NEUTRAL_IMAGES.get(image.name))]),
  );
  const parts = [];
  let outputOffset = 0;
  document.bufferViews.forEach((view, index) => {
    const source = neutralViews.has(index)
      ? neutralViews.get(index)
      : binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const alignedOffset = align4(outputOffset);
    if (alignedOffset > outputOffset) parts.push(Buffer.alloc(alignedOffset - outputOffset));
    view.byteOffset = alignedOffset;
    view.byteLength = source.length;
    parts.push(source);
    outputOffset = alignedOffset + source.length;
  });
  const binaryOutput = Buffer.concat([...parts, Buffer.alloc(align4(outputOffset) - outputOffset)]);
  document.buffers[0].byteLength = binaryOutput.length;

  for (const material of document.materials || []) {
    if (material.name === "Base") material.pbrMetallicRoughness.baseColorFactor = [0.22, 0.09, 0.035, 1];
    if (material.name === "baseBack") material.pbrMetallicRoughness.baseColorFactor = [0.12, 0.045, 0.018, 1];
  }

  const jsonSource = Buffer.from(JSON.stringify(document), "utf8");
  const jsonLength = align4(jsonSource.length);
  const jsonOutput = Buffer.alloc(jsonLength, 0x20);
  jsonSource.copy(jsonOutput);
  const totalLength = 12 + 8 + jsonOutput.length + 8 + binaryOutput.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonOutput.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryOutput.length, 0);
  binaryHeader.writeUInt32LE(BIN_CHUNK, 4);
  return Buffer.concat([header, jsonHeader, jsonOutput, binaryHeader, binaryOutput]);
}

const input = resolve(process.argv[2] || "models/screen_low.glb");
const extractIndex = process.argv.indexOf("--extract");
const outputIndex = process.argv.indexOf("--output");
const { json, binary } = parseGlb(input);

if (extractIndex >= 0) extractImages(json, binary, resolve(process.argv[extractIndex + 1]));
if (outputIndex >= 0) {
  const output = resolve(process.argv[outputIndex + 1]);
  writeFileSync(output, rebuild(json, binary));
  process.stdout.write(`Sanitized ${basename(input)} -> ${basename(output)}\n`);
}
