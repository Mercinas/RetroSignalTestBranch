import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

function parseGlb(path) {
  const source = readFileSync(path);
  assert.equal(source.readUInt32LE(0), 0x46546c67, "GLB magic");
  assert.equal(source.readUInt32LE(4), 2, "GLB version");
  assert.equal(source.readUInt32LE(8), source.length, "GLB length");
  let document;
  let binary;
  for (let offset = 12; offset < source.length;) {
    const length = source.readUInt32LE(offset);
    const type = source.readUInt32LE(offset + 4);
    const chunk = source.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) document = JSON.parse(chunk.toString("utf8").trim());
    if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  assert.ok(document && binary, "GLB contains JSON and binary chunks");
  return { document, binary };
}

function imageDimensions(source, mimeType) {
  if (mimeType === "image/png") {
    assert.equal(source.subarray(1, 4).toString("ascii"), "PNG");
    return [source.readUInt32BE(16), source.readUInt32BE(20)];
  }
  if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset < source.length) {
      assert.equal(source[offset], 0xff, "JPEG marker");
      while (source[offset] === 0xff) offset += 1;
      const marker = source[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9) continue;
      const length = source.readUInt16BE(offset);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return [source.readUInt16BE(offset + 5), source.readUInt16BE(offset + 3)];
      }
      offset += length;
    }
  }
  throw new Error(`Unsupported embedded image ${mimeType}`);
}

test("the television model stays inside its decoded texture budget", () => {
  const path = "models/screen_low.glb";
  const { document, binary } = parseGlb(path);
  const dimensions = document.images.map((image) => {
    const view = document.bufferViews[image.bufferView];
    const source = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    return imageDimensions(source, image.mimeType);
  });
  assert.ok(dimensions.every(([width, height]) => width <= 512 && height <= 512));
  const decodedBytes = dimensions.reduce((total, [width, height]) => total + width * height * 4, 0);
  assert.ok(decodedBytes <= 16 * 1024 * 1024, `decoded texture budget exceeded: ${decodedBytes}`);
  assert.ok(statSync(path).size < 1024 * 1024, "optimized GLB should remain below 1 MiB");

  const material = document.materials.find((entry) => entry.name === "glassBack");
  assert.ok(material, "runtime-replaced screen material exists");
  const textureIndices = [
    material.pbrMetallicRoughness.baseColorTexture.index,
    material.pbrMetallicRoughness.metallicRoughnessTexture.index,
    material.normalTexture.index,
  ];
  const screenImageIndices = textureIndices.map((index) => document.textures[index].source);
  assert.ok(screenImageIndices.every((index) => dimensions[index][0] === 1 && dimensions[index][1] === 1));
});

test("the HDR environment is a complete downsampled Radiance map", () => {
  const path = "textures/colorful_studio_1k.hdr";
  const source = readFileSync(path);
  const headerEnd = source.indexOf(Buffer.from("\n\n"));
  assert.ok(headerEnd > 0, "Radiance header terminator");
  const resolutionStart = headerEnd + 2;
  const resolutionEnd = source.indexOf(0x0a, resolutionStart);
  const match = source.subarray(resolutionStart, resolutionEnd).toString("ascii").match(/^-Y (\d+) \+X (\d+)$/);
  assert.ok(match, "Radiance resolution line");
  const height = Number(match[1]);
  const width = Number(match[2]);
  assert.deepEqual([width, height], [512, 256]);

  let offset = resolutionEnd + 1;
  for (let y = 0; y < height; y += 1) {
    assert.deepEqual(Array.from(source.subarray(offset, offset + 2)), [2, 2]);
    assert.equal(source.readUInt16BE(offset + 2), width);
    offset += 4;
    for (let channel = 0; channel < 4; channel += 1) {
      let decoded = 0;
      while (decoded < width) {
        const count = source[offset];
        offset += 1;
        if (count > 128) {
          decoded += count - 128;
          offset += 1;
        } else {
          decoded += count;
          offset += count;
        }
      }
      assert.equal(decoded, width);
    }
  }
  assert.equal(offset, source.length, "no truncated or trailing RGBE data");
  assert.ok(source.length < 600 * 1024, "optimized HDR should remain below 600 KiB");
});
