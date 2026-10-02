import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const output = resolve(process.env.RETROSIGNAL_SMOKE_OUTPUT || "dist/manager-independence-smoke");
const originalExecFile = childProcess.execFile;
const originalExecute = promisify(originalExecFile);
const livelyCalls = [];
// This harness exercises the actual desktop entry while preventing any Lively
// command from reaching the user's app. Process snapshots are read-only.
childProcess.execFile = function(command, args, options, done) {
  if (String(args?.at(-1)).includes("$livelyProcess")) {
    livelyCalls.push(args.at(-1));
    queueMicrotask(() => done(null, args.at(-1).includes("Start-Process")
      ? '{"opened":false,"message":"Lively is not installed. The Manager works independently."}'
      : '{"changed":false}'));
    return { kill() {} };
  }
  return originalExecFile(command, args, options, done);
};
syncBuiltinESMExports();

const waitFor = async (predicate, timeout = 15_000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await predicate();
    if (value) return value;
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  }
  throw new Error("Independent Manager smoke timed out waiting for a window.");
};
const livelyProcesses = async () => {
  const { stdout } = await originalExecute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "@(Get-Process -Name 'Lively' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id | Sort-Object) | ConvertTo-Json -Compress"], { windowsHide: true, timeout: 10_000 });
  return stdout.trim();
};
await mkdir(output, { recursive: true });
process.env.LOCALAPPDATA = resolve(output, "local-app-data");
process.env.APPDATA = resolve(output, "roaming-app-data");
app.setPath("userData", resolve(output, "electron-user-data"));
app.on("browser-window-created", (_event, window) => window.hide());
const watchdog = setTimeout(() => app.exit(1), 40_000);
app.whenReady().then(async () => {
  try {
    const before = await livelyProcesses();
    await import("../manager/electron-main.mjs");
    const manager = await waitFor(() => BrowserWindow.getAllWindows().find(window => /127\.0\.0\.1/.test(window.webContents.getURL()) && !window.webContents.isLoading()));
    assert.equal(livelyCalls.length, 0, "Manager startup must not issue a Lively command");
    const ready = await manager.webContents.executeJavaScript(`({ button: document.querySelector('#open-lively')?.textContent, status: document.querySelector('#status')?.textContent })`);
    assert.equal(ready.button, "Open Lively");
    assert.match(ready.status, /Player library connected/);
    await manager.webContents.executeJavaScript("document.querySelector('#open-lively').scrollIntoView({block:'center'})");
    await writeFile(resolve(output, "independent-manager-library.png"), (await manager.webContents.capturePage()).toPNG());
    await manager.webContents.executeJavaScript("document.querySelector('#open-lively').click()");
    await waitFor(() => manager.webContents.executeJavaScript("document.querySelector('#status').textContent.includes('not installed')"));
    assert.equal(livelyCalls.length, 1, "Only explicit Open Lively requests may launch it");
    await manager.webContents.executeJavaScript("document.querySelector('#open-player').click()");
    const player = await waitFor(() => BrowserWindow.getAllWindows().find(window => window !== manager && /standalone=1/.test(window.webContents.getURL()) && !window.webContents.isLoading()));
    assert.match(player.webContents.getURL(), /Player\/index.html|Player%2Findex.html|Player\\index.html/);
    const standalone = await waitFor(() => player.webContents.executeJavaScript("document.body.classList.contains('standalone-player') && Boolean(document.querySelector('#standalone-game-screen'))"));
    assert.equal(standalone, true);
    assert.equal(livelyCalls.length, 2, "Player only probes pause state, with no Lively start");
    player.destroy();
    assert.equal(livelyCalls.length, 2, "Closing player must not resume or launch stopped Lively");
    await manager.webContents.executeJavaScript("document.querySelector('[data-manager-view=garden]').click()");
    await waitFor(() => manager.webContents.executeJavaScript("document.body.dataset.managerView === 'garden' && document.querySelector('#manager-garden-host').dataset.state === 'ready'"));
    await manager.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await writeFile(resolve(output, "independent-manager.png"), (await manager.webContents.capturePage()).toPNG());
    const after = await livelyProcesses();
    assert.equal(after, before, "Lively process IDs must remain unchanged");
    const result = { passed: true, startupLivelyCalls: 0, explicitOpenRequests: 1, playerWithoutWallpaper: true, gardenReady: true, livelyProcessesUnchanged: true, output };
    await writeFile(resolve(output, "result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    manager.destroy();
  } catch (error) {
    console.error(error.stack || error);
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    app.exit(1);
  } finally {
    clearTimeout(watchdog);
    app.quit();
  }
});
