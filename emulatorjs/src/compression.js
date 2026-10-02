class EJS_COMPRESSION {
    constructor(EJS) {
        this.EJS = EJS;
        this.workerIdleTimeoutMs = 120000;
        this.maxArchiveBytes = 768 * 1024 * 1024;
        this.maxArchiveFiles = 2048;
        this.maxArchiveFileBytes = 768 * 1024 * 1024;
        this.maxArchiveOutputBytes = 1024 * 1024 * 1024;
    }
    archiveError(message, code = "archive-limit") {
        const error = new Error(message);
        error.code = code;
        return error;
    }
    archiveInput(data) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        if (bytes.byteLength > this.maxArchiveBytes) {
            throw this.archiveError("The archive exceeds the 768 MB safety limit.");
        }
        return bytes;
    }
    archiveEntryGuard() {
        const names = new Set();
        let count = 0;
        let totalBytes = 0;
        return (name, data) => {
            const rawName = String(name || "").replace(/\\/g, "/");
            if (!rawName || rawName.includes("\0") || rawName.startsWith("/") || /^[A-Za-z]:\//.test(rawName)) {
                throw this.archiveError("The archive contains an unsafe file path.", "unsafe-entry-name");
            }
            const parts = rawName.split("/");
            if (parts.some(part => !part || part === "." || part === "..")) {
                throw this.archiveError("The archive contains an unsafe file path.", "unsafe-entry-name");
            }
            const normalizedName = parts.join("/");
            if (names.has(normalizedName)) {
                throw this.archiveError("The archive contains duplicate file paths.", "duplicate-entry");
            }
            const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
            count += 1;
            totalBytes += bytes.byteLength;
            if (count > this.maxArchiveFiles || bytes.byteLength > this.maxArchiveFileBytes || totalBytes > this.maxArchiveOutputBytes) {
                throw this.archiveError("The archive exceeds the extraction safety limit.");
            }
            names.add(normalizedName);
            return { name: normalizedName, data: bytes };
        };
    }
    isCompressed(data) { //https://www.garykessler.net/library/file_sigs.html
        //todo. Use hex instead of numbers
        if ((data[0] === 80 && data[1] === 75) && ((data[2] === 3 && data[3] === 4) || (data[2] === 5 && data[3] === 6) || (data[2] === 7 && data[3] === 8))) {
            return "zip";
        } else if (data[0] === 55 && data[1] === 122 && data[2] === 188 && data[3] === 175 && data[4] === 39 && data[5] === 28) {
            return "7z";
        } else if ((data[0] === 82 && data[1] === 97 && data[2] === 114 && data[3] === 33 && data[4] === 26 && data[5] === 7) && ((data[6] === 0) || (data[6] === 1 && data[7] == 0))) {
            return "rar";
        }
        return null;
    }
    decompress(data, updateMsg, fileCbFunc) {
        const rawInput = data instanceof Uint8Array ? data : new Uint8Array(data);
        const compressed = this.isCompressed(rawInput.slice(0, 10));
        if (compressed === null) {
            if (typeof fileCbFunc === "function") {
                fileCbFunc("!!notCompressedData", rawInput);
            }
            return Promise.resolve({ "!!notCompressedData": rawInput });
        }
        const input = this.archiveInput(data);

        const extraction = compressed === "zip"
            ? this.decompressZip(input, updateMsg, fileCbFunc)
            : this.decompressFile(compressed, input, updateMsg, fileCbFunc);
        return extraction.catch(error => {
            throw this.reportArchiveError(compressed, error);
        });
    }
    async decompressZip(data, updateMsg, fileCbFunc) {
        const input = this.archiveInput(data);
        if (!this.supportsNativeDeflate()) {
            return this.decompressFile("zip", input, updateMsg, fileCbFunc);
        }
        if (!window.EJS_NATIVE_ZIP || typeof window.EJS_NATIVE_ZIP.extract !== "function") {
            return this.decompressFile("zip", input, updateMsg, fileCbFunc);
        }

        if (typeof Worker === "function" && window.EJS_NATIVE_ZIP_WORKER_URL) {
            try {
                return await this.decompressNativeZipWorker(data, updateMsg, fileCbFunc);
            } catch (error) {
                if (!error?.nativeFallbackSafe) throw error;
                console.warn("Native ZIP worker failed before extraction; retrying without a worker.", error);
            }
        }
        const options = {
            onProgress: (current, total) => this.updateProgress(updateMsg, current, total)
        };
        if (typeof fileCbFunc === "function") {
            const guard = this.archiveEntryGuard();
            options.onFile = (name, output) => {
                const file = guard(name, output);
                fileCbFunc(file.name, file.data);
            };
            return window.EJS_NATIVE_ZIP.extract(input, options);
        }
        const extracted = await window.EJS_NATIVE_ZIP.extract(input, options);
        const guard = this.archiveEntryGuard();
        const files = Object.create(null);
        for (const [name, output] of Object.entries(extracted)) {
            const file = guard(name, output);
            files[file.name] = file.data;
        }
        return files;
    }
    supportsNativeDeflate() {
        if (typeof window.DecompressionStream !== "function") return false;
        try {
            new window.DecompressionStream("deflate-raw");
            return true;
        } catch (error) {
            return false;
        }
    }
    updateProgress(updateMsg, current, total) {
        if (typeof updateMsg !== "function" || total <= 0) return;
        const percent = Math.floor(current / total * 100);
        if (!isNaN(percent)) updateMsg(" " + percent.toString() + "%", true);
    }
    decompressNativeZipWorker(data, updateMsg, fileCbFunc) {
        return new Promise((resolve, reject) => {
            let worker;
            try {
                worker = new Worker(window.EJS_NATIVE_ZIP_WORKER_URL);
            } catch (error) {
                if (error && typeof error === "object") error.nativeFallbackSafe = true;
                reject(error);
                return;
            }
            const files = Object.create(null);
            const guard = this.archiveEntryGuard();
            let extractedFiles = 0;
            let timeoutId;
            let settled = false;

            const cleanup = () => {
                clearTimeout(timeoutId);
                worker.terminate();
            };
            const finish = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(files);
            };
            const fail = (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                const failure = error instanceof Error ? error : new Error(String(error));
                if (extractedFiles === 0) failure.nativeFallbackSafe = true;
                reject(failure);
            };
            const resetTimeout = () => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    fail(new Error("The ZIP extractor stopped responding for " + Math.round(this.workerIdleTimeoutMs / 1000) + " seconds."));
                }, this.workerIdleTimeoutMs);
            };

            worker.onerror = event => {
                if (event && typeof event.preventDefault === "function") event.preventDefault();
                fail(new Error("The ZIP extractor crashed" + (event && event.message ? ": " + event.message : ".")));
            };
            worker.onmessageerror = () => {
                fail(new Error("The ZIP extractor returned an unreadable message."));
            };
            worker.onmessage = event => {
                if (!event.data || settled) return;
                resetTimeout();
                try {
                    if (event.data.t === 5) {
                        this.updateProgress(updateMsg, event.data.current, event.data.total);
                    } else if (event.data.t === 4) {
                        this.updateProgress(updateMsg, event.data.current, event.data.total);
                    } else if (event.data.t === 2) {
                        const file = guard(event.data.file, event.data.data);
                        extractedFiles += 1;
                        if (typeof fileCbFunc === "function") {
                            fileCbFunc(file.name, file.data);
                            files[file.name] = true;
                        } else {
                            files[file.name] = file.data;
                        }
                    } else if (event.data.t === 3) {
                        const error = new Error(event.data.message || "The ZIP extractor failed.");
                        error.code = event.data.code || "archive-extraction-failed";
                        fail(error);
                    } else if (event.data.t === 1) {
                        finish();
                    }
                } catch (error) {
                    fail(error);
                }
            };

            resetTimeout();
            try {
                const input = data instanceof Uint8Array ? data : new Uint8Array(data);
                const archive = data instanceof ArrayBuffer
                    ? data
                    : input.slice().buffer;
                worker.postMessage({ archive }, [archive]);
            } catch (error) {
                fail(error);
            }
        });
    }
    reportArchiveError(method, error) {
        const archiveName = method === "7z" ? "7z archive" : method.toUpperCase() + " archive";
        const detail = error && error.message ? error.message : "Unknown extraction failure.";
        const message = "Could not extract the " + archiveName + ": " + detail;
        console.error(message, error);
        if (this.EJS && typeof this.EJS.startGameError === "function") {
            this.EJS.startGameError(message);
        }
        const reportedError = new Error(message);
        reportedError.cause = error;
        reportedError.code = error && error.code ? error.code : "archive-extraction-failed";
        return reportedError;
    }
    async getWorkerFile(method) {
        let path, obj;
        if (method === "7z") {
            path = "compression/extract7z.js";
            obj = "sevenZip";
        } else if (method === "zip") {
            path = "compression/extractzip.js";
            obj = "zip";
        } else if (method === "rar") {
            path = "compression/libunrar.js";
            obj = "rar";
        } else {
            throw new Error("No worker extractor is available for " + method + ".");
        }

        const res = await this.EJS.downloadFile(path, null, false, { responseType: "text", method: "GET" });
        if (res === -1) {
            throw new Error("The " + obj + " extractor could not be downloaded.");
        }

        const dependencyUrls = [];
        if (method === "rar") {
            const res2 = await this.EJS.downloadFile("compression/libunrar.wasm", null, false, { responseType: "arraybuffer", method: "GET" });
            if (res2 === -1) {
                throw new Error("The rar WebAssembly extractor could not be downloaded.");
            }
            const wasmUrl = URL.createObjectURL(new Blob([res2.data], { type: "application/wasm" }));
            dependencyUrls.push(wasmUrl);
            const script = `
                let dataToPass = [];
                Module = {
                    monitorRunDependencies: function(left) {
                        if (left == 0) {
                            setTimeout(function() {
                                unrar(dataToPass, null);
                            }, 100);
                        }
                    },
                    onRuntimeInitialized: function() {},
                    locateFile: function(file) {
                        return "${wasmUrl}";
                    }
                };
                ${res.data}
                let unrar = function(data, password) {
                    let cb = function(fileName, fileSize, progress) {
                        postMessage({ "t": 4, "current": progress, "total": fileSize, "name": fileName });
                    };
                    let rarContent = readRARContent(data.map(function(d) {
                        return {
                            name: d.name,
                            content: new Uint8Array(d.content)
                        };
                    }), password, cb);
                    let rec = function(entry) {
                        if (!entry) return;
                        if (entry.type === "file") {
                            postMessage({ "t": 2, "file": entry.fullFileName, "size": entry.fileSize, "data": entry.fileContent });
                        } else if (entry.type === "dir") {
                            Object.keys(entry.ls).forEach(function(k) {
                                rec(entry.ls[k]);
                            });
                        } else {
                            throw new Error("Unknown rar entry type");
                        }
                    };
                    rec(rarContent);
                    postMessage({ "t": 1 });
                    return rarContent;
                };
                onmessage = function(data) {
                    dataToPass.push({ name: "game.rar", content: data.data });
                };
            `;
            return {
                blob: new Blob([script], { type: "application/javascript" }),
                dependencyUrls
            };
        }

        return {
            blob: new Blob([res.data], { type: "application/javascript" }),
            dependencyUrls
        };
    }
    async decompressFile(method, data, updateMsg, fileCbFunc) {
        const input = this.archiveInput(data);
        const workerFile = await this.getWorkerFile(method);
        return new Promise((resolve, reject) => {
            const workerUrl = URL.createObjectURL(workerFile.blob);
            let worker;
            try {
                worker = new Worker(workerUrl);
            } catch (error) {
                URL.revokeObjectURL(workerUrl);
                workerFile.dependencyUrls.forEach(url => URL.revokeObjectURL(url));
                reject(error);
                return;
            }
            const files = Object.create(null);
            const guard = this.archiveEntryGuard();
            let timeoutId;
            let settled = false;

            const cleanup = () => {
                clearTimeout(timeoutId);
                worker.terminate();
                URL.revokeObjectURL(workerUrl);
                workerFile.dependencyUrls.forEach(url => URL.revokeObjectURL(url));
            };
            const finish = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(files);
            };
            const fail = (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error instanceof Error ? error : new Error(String(error)));
            };
            const resetTimeout = () => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    fail(new Error("The " + method + " extractor stopped responding for " + Math.round(this.workerIdleTimeoutMs / 1000) + " seconds."));
                }, this.workerIdleTimeoutMs);
            };

            worker.onerror = event => {
                if (event && typeof event.preventDefault === "function") event.preventDefault();
                fail(new Error("The " + method + " extractor crashed" + (event && event.message ? ": " + event.message : ".")));
            };
            worker.onmessageerror = () => {
                fail(new Error("The " + method + " extractor returned an unreadable message."));
            };
            worker.onmessage = event => {
                if (!event.data || settled) return;
                resetTimeout();
                try {
                    // event.data.t: 4=progress, 2=file, 1=archive done
                    if (event.data.t === 4) {
                        const progressData = event.data;
                        const percent = Math.floor(progressData.current / progressData.total * 100);
                        if (!isNaN(percent) && typeof updateMsg === "function") {
                            updateMsg(" " + percent.toString() + "%", true);
                        }
                    } else if (event.data.t === 2) {
                        const file = guard(event.data.file, event.data.data);
                        if (typeof fileCbFunc === "function") {
                            fileCbFunc(file.name, file.data);
                            files[file.name] = true;
                        } else {
                            files[file.name] = file.data;
                        }
                    } else if (event.data.t === 1) {
                        finish();
                    }
                } catch (error) {
                    fail(error);
                }
            };

            resetTimeout();
            try {
                worker.postMessage(input);
            } catch (error) {
                fail(error);
            }
        });
    }
}

window.EJS_COMPRESSION = EJS_COMPRESSION;
