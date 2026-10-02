"use strict";

importScripts("nativezip.js?retrosignal=8");

function transferableView(data) {
    if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) return data;
    return data.slice();
}

self.onmessage = async event => {
    let lastProgressAt = 0;
    try {
        await self.EJS_NATIVE_ZIP.extract(event.data.archive, {
            onFile(name, data) {
                const output = transferableView(data);
                self.postMessage({ t: 2, file: name, size: output.byteLength, data: output }, [output.buffer]);
            },
            onProgress(current, total, name) {
                self.postMessage({ t: 4, current, total, name });
            },
            onDataProgress(current, total, name) {
                const now = Date.now();
                if (now - lastProgressAt < 250 && current < total) return;
                lastProgressAt = now;
                self.postMessage({ t: 5, current, total, name });
            }
        });
        self.postMessage({ t: 1 });
    } catch (error) {
        self.postMessage({
            t: 3,
            code: error && error.code ? error.code : "archive-extraction-failed",
            message: error && error.message ? error.message : String(error)
        });
    }
};
