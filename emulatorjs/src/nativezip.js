(function(global) {
    "use strict";

    const SIGNATURES = Object.freeze({
        endOfCentralDirectory: 0x06054b50,
        centralDirectoryEntry: 0x02014b50,
        localFileHeader: 0x04034b50
    });
    const MAX_COMMENT_LENGTH = 0xffff;
    // CD images can be large, but archive extraction runs inside Lively's
    // wallpaper process. Keep a single import below a practical memory ceiling.
    const MAX_ARCHIVE_SIZE = 768 * 1024 * 1024;
    const MAX_ENTRY_COUNT = 2048;
    const MAX_ENTRY_UNCOMPRESSED_SIZE = 768 * 1024 * 1024;
    const MAX_TOTAL_UNCOMPRESSED_SIZE = 1024 * 1024 * 1024;
    const INITIAL_INFLATE_BUFFER_SIZE = 64 * 1024;
    const UNICODE_PATH_EXTRA_FIELD = 0x7075;
    const CP437_EXTENDED =
        "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒ" +
        "áíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐" +
        "└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀" +
        "αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";

    class EJS_ZIP_ERROR extends Error {
        constructor(message, code) {
            super(message);
            this.name = "EJS_ZIP_ERROR";
            this.code = code || "invalid-zip";
        }
    }

    const crcTable = new Uint32Array(256);
    for (let i = 0; i < crcTable.length; i++) {
        let value = i;
        for (let bit = 0; bit < 8; bit++) {
            value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
        }
        crcTable[i] = value >>> 0;
    }

    function crc32(data) {
        let crc = 0xffffffff;
        for (let i = 0; i < data.length; i++) {
            crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function fail(message, code) {
        throw new EJS_ZIP_ERROR(message, code);
    }

    function assertRange(dataLength, offset, size, description) {
        if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > dataLength) {
            fail("The ZIP is truncated near " + description + ".", "truncated-zip");
        }
    }

    function findEndOfCentralDirectory(view) {
        if (view.byteLength < 22) {
            fail("The selected file is too small to be a ZIP archive.", "invalid-zip");
        }

        const earliestOffset = Math.max(0, view.byteLength - 22 - MAX_COMMENT_LENGTH);
        for (let offset = view.byteLength - 22; offset >= earliestOffset; offset--) {
            if (view.getUint32(offset, true) !== SIGNATURES.endOfCentralDirectory) continue;
            const commentLength = view.getUint16(offset + 20, true);
            if (offset + 22 + commentLength === view.byteLength) return offset;
        }
        fail("The ZIP directory could not be found.", "invalid-zip");
    }

    function decodeUtf8(bytes, description) {
        try {
            return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch (error) {
            fail("A ZIP entry has an invalid UTF-8 " + description + ".", "invalid-entry-name");
        }
    }

    function decodeCp437(bytes) {
        let result = "";
        for (const byte of bytes) {
            result += byte < 0x80 ? String.fromCharCode(byte) : CP437_EXTENDED[byte - 0x80];
        }
        return result;
    }

    function decodeUnicodePath(extra, rawName) {
        let offset = 0;
        while (offset < extra.byteLength) {
            if (offset + 4 > extra.byteLength) {
                fail("A ZIP entry has a truncated extra field.", "invalid-zip");
            }
            const fieldId = extra[offset] | (extra[offset + 1] << 8);
            const fieldSize = extra[offset + 2] | (extra[offset + 3] << 8);
            offset += 4;
            if (offset + fieldSize > extra.byteLength) {
                fail("A ZIP entry has an invalid extra-field length.", "invalid-zip");
            }
            if (fieldId === UNICODE_PATH_EXTRA_FIELD && fieldSize >= 5) {
                const version = extra[offset];
                const expectedNameCrc =
                    (extra[offset + 1] |
                    (extra[offset + 2] << 8) |
                    (extra[offset + 3] << 16) |
                    (extra[offset + 4] << 24)) >>> 0;
                if (version === 1 && expectedNameCrc === crc32(rawName)) {
                    return decodeUtf8(extra.subarray(offset + 5, offset + fieldSize), "Unicode path");
                }
            }
            offset += fieldSize;
        }
        return "";
    }

    function decodeFileName(bytes, utf8, extra) {
        if (bytes.length === 0) fail("The ZIP contains an entry with no name.", "invalid-entry-name");
        if (utf8) return decodeUtf8(bytes, "filename");
        return decodeUnicodePath(extra, bytes) || decodeCp437(bytes);
    }

    function normalizeFileName(fileName) {
        if (fileName.includes("\0")) fail("A ZIP entry name contains a null byte.", "unsafe-entry-name");
        const normalizedSlashes = fileName.replace(/\\/g, "/");
        if (normalizedSlashes.startsWith("/") || /^[A-Za-z]:\//.test(normalizedSlashes)) {
            fail("The ZIP contains an absolute path: " + fileName, "unsafe-entry-name");
        }

        const isDirectory = normalizedSlashes.endsWith("/");
        const parts = normalizedSlashes.split("/");
        const safeParts = [];
        for (const part of parts) {
            if (part === "" || part === ".") continue;
            if (part === "..") fail("The ZIP contains an unsafe parent path: " + fileName, "unsafe-entry-name");
            safeParts.push(part);
        }
        if (safeParts.length === 0) fail("The ZIP contains an unusable entry name.", "invalid-entry-name");
        return safeParts.join("/") + (isDirectory ? "/" : "");
    }

    function readEntries(data, view) {
        const eocdOffset = findEndOfCentralDirectory(view);
        const diskNumber = view.getUint16(eocdOffset + 4, true);
        const centralDirectoryDisk = view.getUint16(eocdOffset + 6, true);
        const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
        const entryCount = view.getUint16(eocdOffset + 10, true);
        const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
        const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);

        if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
            fail("Multi-part ZIP archives are not supported.", "unsupported-zip");
        }
        if (entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
            fail("ZIP64 archives are not supported. Extract the ROM first or create a standard ZIP.", "unsupported-zip64");
        }
        if (entryCount > MAX_ENTRY_COUNT) {
            fail("The ZIP contains too many files.", "archive-limit");
        }
        assertRange(data.byteLength, centralDirectoryOffset, centralDirectorySize, "the central directory");
        if (centralDirectoryOffset + centralDirectorySize > eocdOffset) {
            fail("The ZIP central directory is invalid.", "invalid-zip");
        }

        const entries = [];
        const names = new Set();
        let totalUncompressedSize = 0;
        let offset = centralDirectoryOffset;
        for (let index = 0; index < entryCount; index++) {
            assertRange(data.byteLength, offset, 46, "a central-directory entry");
            if (view.getUint32(offset, true) !== SIGNATURES.centralDirectoryEntry) {
                fail("The ZIP central directory contains an invalid entry.", "invalid-zip");
            }

            const flags = view.getUint16(offset + 8, true);
            const method = view.getUint16(offset + 10, true);
            const expectedCrc = view.getUint32(offset + 16, true);
            const compressedSize = view.getUint32(offset + 20, true);
            const uncompressedSize = view.getUint32(offset + 24, true);
            const nameLength = view.getUint16(offset + 28, true);
            const extraLength = view.getUint16(offset + 30, true);
            const commentLength = view.getUint16(offset + 32, true);
            const startDisk = view.getUint16(offset + 34, true);
            const localHeaderOffset = view.getUint32(offset + 42, true);
            const entryLength = 46 + nameLength + extraLength + commentLength;
            assertRange(data.byteLength, offset, entryLength, "a central-directory entry");

            if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
                fail("Password-protected ZIP entries are not supported.", "encrypted-zip");
            }
            if (startDisk !== 0) fail("Multi-part ZIP archives are not supported.", "unsupported-zip");
            if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
                fail("ZIP64 entries are not supported. Extract the ROM first or create a standard ZIP.", "unsupported-zip64");
            }

            const rawName = data.subarray(offset + 46, offset + 46 + nameLength);
            const extra = data.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
            const name = normalizeFileName(decodeFileName(rawName, (flags & 0x0800) !== 0, extra));
            if (names.has(name)) fail("The ZIP contains duplicate paths: " + name, "duplicate-entry");
            names.add(name);

            if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_SIZE) {
                fail("A ZIP entry exceeds the 768 MB safety limit.", "archive-limit");
            }
            totalUncompressedSize += uncompressedSize;
            if (!Number.isSafeInteger(totalUncompressedSize) || totalUncompressedSize > MAX_TOTAL_UNCOMPRESSED_SIZE) {
                fail("The ZIP expands beyond the 1 GB safety limit.", "archive-limit");
            }

            entries.push({
                name,
                flags,
                method,
                expectedCrc,
                compressedSize,
                uncompressedSize,
                localHeaderOffset
            });
            offset += entryLength;
        }

        if (offset > centralDirectoryOffset + centralDirectorySize) {
            fail("The ZIP central directory size is invalid.", "invalid-zip");
        }
        return entries;
    }

    async function inflateRaw(compressedData, fileName, expectedSize, onDataProgress) {
        if (typeof global.DecompressionStream !== "function") {
            fail("This browser cannot extract DEFLATE ZIP entries. Extract " + fileName + " before importing it.", "deflate-unavailable");
        }

        let decompressor;
        try {
            decompressor = new global.DecompressionStream("deflate-raw");
        } catch (error) {
            fail("This browser cannot extract DEFLATE ZIP entries. Extract " + fileName + " before importing it.", "deflate-unavailable");
        }

        const stream = new Blob([compressedData]).stream().pipeThrough(decompressor);
        const reader = stream.getReader();
        let output = new Uint8Array(0);
        let outputLength = 0;
        try {
            while (true) {
                const result = await reader.read();
                if (result.done) break;
                const chunk = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value);
                const nextLength = outputLength + chunk.byteLength;
                if (!Number.isSafeInteger(nextLength) || nextLength > expectedSize) {
                    await reader.cancel("ZIP entry exceeded its declared size.");
                    fail("ZIP entry size check failed for " + fileName + ".", "size-mismatch");
                }
                if (nextLength > output.byteLength) {
                    const grownSize = output.byteLength === 0
                        ? Math.min(expectedSize, INITIAL_INFLATE_BUFFER_SIZE)
                        : Math.min(expectedSize, output.byteLength * 2);
                    const replacement = new Uint8Array(Math.max(nextLength, grownSize));
                    replacement.set(output.subarray(0, outputLength));
                    output = replacement;
                }
                output.set(chunk, outputLength);
                outputLength = nextLength;
                if (onDataProgress) onDataProgress(outputLength, expectedSize);
            }
        } catch (error) {
            if (error instanceof EJS_ZIP_ERROR) throw error;
            fail("Could not inflate " + fileName + ": " + (error && error.message ? error.message : "invalid DEFLATE data"), "invalid-deflate");
        } finally {
            reader.releaseLock();
        }

        if (outputLength !== expectedSize) {
            fail("ZIP entry size check failed for " + fileName + ".", "size-mismatch");
        }
        return output;
    }

    async function extractEntry(data, view, entry, onDataProgress) {
        assertRange(data.byteLength, entry.localHeaderOffset, 30, "the local header for " + entry.name);
        if (view.getUint32(entry.localHeaderOffset, true) !== SIGNATURES.localFileHeader) {
            fail("The ZIP has an invalid local header for " + entry.name + ".", "invalid-zip");
        }
        const localFlags = view.getUint16(entry.localHeaderOffset + 6, true);
        const localMethod = view.getUint16(entry.localHeaderOffset + 8, true);
        const localNameLength = view.getUint16(entry.localHeaderOffset + 26, true);
        const localExtraLength = view.getUint16(entry.localHeaderOffset + 28, true);
        if ((localFlags & 0x0001) !== 0 || (localFlags & 0x0040) !== 0) {
            fail("Password-protected ZIP entries are not supported.", "encrypted-zip");
        }
        if (localMethod !== entry.method) {
            fail("The ZIP compression method changed between headers for " + entry.name + ".", "invalid-zip");
        }

        const dataOffset = entry.localHeaderOffset + 30 + localNameLength + localExtraLength;
        assertRange(data.byteLength, dataOffset, entry.compressedSize, "the compressed data for " + entry.name);
        const compressedData = data.subarray(dataOffset, dataOffset + entry.compressedSize);
        let output;
        if (entry.method === 0) {
            if (entry.compressedSize !== entry.uncompressedSize) {
                fail("Stored ZIP entry size mismatch for " + entry.name + ".", "invalid-zip");
            }
            output = compressedData.slice();
        } else if (entry.method === 8) {
            output = await inflateRaw(compressedData, entry.name, entry.uncompressedSize, onDataProgress);
        } else {
            fail("ZIP compression method " + entry.method + " is not supported for " + entry.name + ".", "unsupported-compression");
        }

        if (output.byteLength !== entry.uncompressedSize) {
            fail("ZIP entry size check failed for " + entry.name + ".", "size-mismatch");
        }
        if (crc32(output) !== entry.expectedCrc) {
            fail("ZIP integrity check failed for " + entry.name + ".", "crc-mismatch");
        }
        return output;
    }

    async function extract(input, options) {
        const data = input instanceof Uint8Array ? input : new Uint8Array(input);
        if (data.byteLength > MAX_ARCHIVE_SIZE) {
            fail("The ZIP exceeds the 768 MB safety limit.", "archive-limit");
        }
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const entries = readEntries(data, view);
        const files = Object.create(null);
        const onFile = options && typeof options.onFile === "function" ? options.onFile : null;
        const onProgress = options && typeof options.onProgress === "function" ? options.onProgress : null;
        const onDataProgress = options && typeof options.onDataProgress === "function" ? options.onDataProgress : null;

        for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            const fileData = await extractEntry(data, view, entry, onDataProgress
                ? (current, total) => onDataProgress(current, total, entry.name, index + 1, entries.length)
                : null);
            if (onFile) {
                onFile(entry.name, fileData);
                files[entry.name] = true;
            } else {
                files[entry.name] = fileData;
            }
            if (onProgress) onProgress(index + 1, entries.length, entry.name);
        }
        return files;
    }

    const currentScriptUrl = typeof document !== "undefined" && document.currentScript
        ? document.currentScript.src
        : "";
    global.EJS_NATIVE_ZIP_WORKER_URL = currentScriptUrl
        ? new URL("nativezip-worker.js?retrosignal=8", currentScriptUrl).href
        : "";
    global.EJS_NATIVE_ZIP = Object.freeze({ extract, EJS_ZIP_ERROR });
})(typeof window !== "undefined" ? window : globalThis);
