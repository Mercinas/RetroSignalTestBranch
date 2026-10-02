// Explicit packaged GUI acceptance. Coordinate visible windows before running:
// $env:RETROSIGNAL_ALLOW_VISIBLE_GUI_TEST='1'
// node tests/manager-only-acceptance.mjs <packaged-exe> <new-output-directory>
// Node 22+ supplies native fetch/WebSocket; no browser automation dependency.
// The generated .nes file is synthetic import data, NOT a playable game.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdir, open, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const SYSTEM_IDS = ['n64', 'gb', 'gba', 'atari2600', 'atari5200', 'nes', 'mastersystem', 'atari7800', 'tg16', 'genesis', 'tgcd', 'snes', 'cdi', 'segacd', 'jaguar', 'sega32x', 'saturn', 'psx', 'lynx', 'gamegear', 'virtualboy'];
assert.equal(process.env.RETROSIGNAL_ALLOW_VISIBLE_GUI_TEST, '1', 'Visible packaged GUI acceptance requires coordinated RETROSIGNAL_ALLOW_VISIBLE_GUI_TEST=1.');
assert.ok(process.argv[2] && process.argv[3], 'Usage: node tests/manager-only-acceptance.mjs <packaged-exe> <new-output-directory>');
assert.equal(process.platform, 'win32', 'This acceptance harness targets the Windows package.');
assert.equal(typeof WebSocket, 'function', 'Use Node 22 or newer for native CDP WebSocket support.');
const executable = await realpath(resolve(process.argv[2]));
const output = resolve(process.argv[3]);
assert.ok((await stat(executable)).isFile(), 'The packaged executable must exist.');
await mkdir(dirname(output), { recursive: true });
// Reusing a profile could hide first-run bugs or touch an earlier test's saves.
await mkdir(output);
const roots = Object.fromEntries(['local', 'roaming', 'chromium', 'temp', 'fixtures'].map(name => [name, join(output, name)]));
for (const directory of Object.values(roots)) await mkdir(directory);
const dataRoot = join(roots.local, 'RetroSignal');
const playerRoot = join(dataRoot, 'Player');
const log = value => appendFileSync(join(output, 'events.jsonl'), JSON.stringify({ utc: new Date().toISOString(), phase, ...value }) + '\n');
let phase = 'package-inventory';
let child;
let launchError;
let timedOut = false;
let watchdog;
const sessions = [];
const checks = {};
const errors = [];
const pause = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const within = (root, path) => { const delta = relative(root, resolve(path)); return delta === '' || (!isAbsolute(delta) && delta !== '..' && !delta.startsWith('..' + sep)); };
const forbiddenPackagePath = path => /(?:^|\/)packages\/garden(?:\/|$)|(?:^|\/)manager\/(?:garden[^/]*|play-credit[^/]*|running-session-union\.mjs)(?:\/|$)/i.test(path);

async function filePaths(root, prefix = '') {
  const paths = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'Acceptance profile/package must not contain links: ' + join(root, prefix, entry.name));
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) paths.push(...await filePaths(root, path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

// Read only ASAR's bounded JSON header; do not extract or modify the package.
async function asarPaths(path) {
  const handle = await open(path, 'r');
  try {
    const preamble = Buffer.alloc(16);
    assert.equal((await handle.read(preamble, 0, 16, 0)).bytesRead, 16, 'ASAR header is complete.');
    assert.equal(preamble.readUInt32LE(0), 4, 'Expected Electron ASAR size pickle.');
    const length = preamble.readUInt32LE(12);
    assert.ok(length > 0 && length < 64 * 1024 * 1024, 'ASAR metadata length must be bounded.');
    const buffer = Buffer.alloc(length);
    assert.equal((await handle.read(buffer, 0, length, 16)).bytesRead, length);
    const header = JSON.parse(buffer.toString('utf8'));
    const paths = [];
    const visit = (files, prefix = '') => {
      for (const [name, entry] of Object.entries(files || {})) {
        const path = prefix + name;
        paths.push(path);
        if (entry.files) visit(entry.files, path + '/');
      }
    };
    visit(header.files);
    return paths;
  } finally { await handle.close(); }
}

function livelyProcesses() {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "@(Get-Process -Name 'Lively' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id | Sort-Object) | ConvertTo-Json -Compress"],
  { windowsHide: true, timeout: 10_000 }).toString().trim();
}

function terminateChild() {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  // Never kill by image name, discover unrelated processes, or touch profiles.
  execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 15_000, stdio: 'pipe' });
}

async function eventually(action, description, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (timedOut) throw new Error('Acceptance exceeded its overall time budget.');
    if (launchError) throw launchError;
    if (child && (child.exitCode !== null || child.signalCode !== null)) throw new Error('Packaged Manager exited unexpectedly: ' + (child.exitCode ?? child.signalCode));
    try { const value = await action(); if (value) return value; }
    catch (error) {
      if (!/Execution context was destroyed|Cannot find context|fetch failed|ECONNREFUSED/.test(error.message)) throw error;
    }
    await pause(100);
  }
  throw new Error(phase + ': timed out waiting for ' + description);
}

async function attach(target, name) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP connection timed out: ' + name)), 10_000);
    socket.addEventListener('open', () => { clearTimeout(timeout); done(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP connection failed: ' + name)); }, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const requests = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    if (message.method === 'Runtime.exceptionThrown') errors.push({ target: name, phase, exception: message.params.exceptionDetails });
    if (!pending.has(message.id)) return;
    const { done, reject, timer } = pending.get(message.id);
    clearTimeout(timer); pending.delete(message.id);
    if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else done(message.result);
  });
  socket.addEventListener('close', () => {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('CDP target closed: ' + name)); }
    pending.clear();
  });
  const command = (method, params = {}) => new Promise((done, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(phase + ': CDP timed out: ' + method)); }, 15_000);
    pending.set(id, { done, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => (await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  const poll = (expression, description = expression, timeout) => eventually(() => evaluate(expression), description, timeout);
  const click = async selector => {
    const point = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw Error('Missing clickable element'); e.scrollIntoView({block:'center',behavior:'instant'}); const r=e.getBoundingClientRect(); if(!r.width||!r.height||e.disabled)throw Error('Element is not clickable'); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  };
  const key = async (key, code, keyCode) => {
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  };
  const screenshot = async filename => writeFile(join(output, filename + '.png'), Buffer.from((await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
  const session = { socket, command, evaluate, poll, click, key, screenshot, requests };
  sessions.push(session);
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Emulation.setFocusEmulationEnabled', { enabled: true });
  return session;
}

let result;
try {
  const resources = join(dirname(executable), 'resources');
  const packagedPaths = await asarPaths(join(resources, 'app.asar'));
  const resourcePaths = await filePaths(resources);
  assert.ok(packagedPaths.includes('manager/electron-main.mjs'), 'Package must include the normal Manager entry.');
  assert.ok(resourcePaths.includes('player-runtime/index.html'), 'Package must bundle the standalone player runtime.');
  const forbidden = [...packagedPaths, ...resourcePaths].filter(forbiddenPackagePath);
  assert.deepEqual(forbidden, [], 'Garden code/assets must not ship in the Manager package.');
  await writeFile(join(output, 'package-files.json'), JSON.stringify({ asar: packagedPaths, resources: resourcePaths }, null, 2));
  checks.package = { asarPaths: packagedPaths.length, resourcePaths: resourcePaths.length, gardenFiles: forbidden };

  const fixtureName = 'Synthetic_import_fixture.nes';
  const fixtureBytes = Buffer.from('RetroSignal acceptance: synthetic import-only bytes. No game program, firmware, or third-party ROM content.\n');
  await mkdir(join(roots.fixtures, 'nes'));
  await writeFile(join(roots.fixtures, 'nes', fixtureName), fixtureBytes);
  const fixtureSha256 = createHash('sha256').update(fixtureBytes).digest('hex');
  await writeFile(join(output, 'fixture.json'), JSON.stringify({ kind: 'generated-synthetic-import-only', filename: fixtureName, sha256: fixtureSha256, playable: false }, null, 2));
  const beforeLively = livelyProcesses();
  const listener = createServer();
  await new Promise(done => listener.listen(0, '127.0.0.1', done));
  const port = listener.address().port;
  await new Promise(done => listener.close(done));
  const childEnvironment = { ...process.env, LOCALAPPDATA: roots.local, APPDATA: roots.roaming, TEMP: roots.temp, TMP: roots.temp };
  // An inherited developer Electron override must not change the packaged entry.
  delete childEnvironment.ELECTRON_RUN_AS_NODE;
  delete childEnvironment.NODE_OPTIONS;
  phase = 'packaged-startup';
  child = spawn(executable, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${roots.chromium}`], {
    cwd: output, windowsHide: true, env: childEnvironment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.on('error', error => { launchError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => appendFileSync(join(output, 'process.log'), chunk));
  await writeFile(join(output, 'launch.json'), JSON.stringify({ executable, pid: child.pid, startedUTC: new Date().toISOString(), roots, normalPackagedEntry: true }, null, 2));
  watchdog = setTimeout(() => { timedOut = true; log({ overallBudgetExpired: true }); try { terminateChild(); } catch (error) { log({ cleanupError: String(error) }); } }, 300_000);
  const targets = async () => (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
  const target = await eventually(async () => (await targets()).find(item => item.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(item.url)), 'the normal Manager loopback page', 60_000);
  const manager = await attach(target, 'manager');
  const loaded = () => manager.poll("document.readyState==='complete' && document.querySelectorAll('.cl-mapper').length===21", 'all 21 controller editors');
  await loaded();
  assert.match(await manager.evaluate("document.querySelector('#status').textContent"), /Player library connected/);
  // Capture a complete normal page load after Network.enable, including imports.
  await manager.command('Page.reload', { ignoreCache: true });
  await loaded();
  const health = await (await fetch(target.url + 'health', { signal: AbortSignal.timeout(2000) })).json();
  assert.equal(health.name, 'RetroSignal Manager');
  const initial = await manager.evaluate(`({ title:document.title, systems:[...document.querySelectorAll('.systems>ul>li[data-system-id]')].map(e=>e.dataset.systemId), gardenText:/garden/i.test(document.body.innerText), gardenHost:!!document.querySelector('#manager-garden-host,[data-manager-view="garden"]'), gardenScripts:[...document.scripts].map(e=>e.src).filter(s=>/garden/i.test(s)), gardenBridge:Object.keys(window.RetroSignalDesktop||{}).filter(k=>/garden|credit/i.test(k)), source:document.querySelector('#source').value })`);
  assert.match(initial.title, /RetroSignal Manager/);
  assert.deepEqual(initial.systems.toSorted(), SYSTEM_IDS.toSorted());
  assert.equal(initial.gardenText, false, 'Normal Manager UI must not advertise Garden.');
  assert.equal(initial.gardenHost, false); assert.deepEqual(initial.gardenScripts, []); assert.deepEqual(initial.gardenBridge, []);
  assert.equal(initial.source, '', 'Acceptance must start with an empty isolated source setting.');
  assert.ok((await stat(join(playerRoot, 'index.html'))).isFile(), 'Only the isolated bundled player may receive mappings/imports.');
  checks.startup = { ...initial, health, isolatedPlayerLibrary: true };
  await manager.screenshot('01-manager-startup');
  const library = () => manager.evaluate("fetch('/api/v1/library').then(async r=>{if(!r.ok)throw Error('Library HTTP '+r.status);return r.json()})");
  assert.ok(Object.values((await library()).manifest || {}).every(games => games.length === 0), 'No normal library should be visible.');

  const systemButton = system => `.systems>ul>li[data-system-id="${system}"] .system-open`;
  const mapper = system => `[data-controller-mapper][data-system-id="${system}"]`;
  const openSystem = async system => {
    if (await manager.evaluate(`document.querySelector(${JSON.stringify(systemButton(system))}).getAttribute('aria-expanded')==='true'`)) return;
    await manager.click(systemButton(system));
    await manager.poll(`document.querySelector(${JSON.stringify(systemButton(system))}).getAttribute('aria-expanded')==='true'`, 'open controller ' + system);
  };
  const mapperButton = async (system, text) => {
    const selector = mapper(system) + ' > button';
    if (text === 'Save keyboard mapping') return manager.click(selector);
    await manager.evaluate(`(() => {const b=[...document.querySelector(${JSON.stringify(mapper(system))}).querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)});if(!b)throw Error('Missing mapping action');b.dataset.acceptanceAction='current';})()`);
    await manager.click(mapper(system) + ' [data-acceptance-action="current"]');
  };
  phase = 'all-21-controller-mappings';
  const mappings = [];
  for (let index = 0; index < SYSTEM_IDS.length; index++) {
    const system = SYSTEM_IDS[index];
    await openSystem(system);
    const detail = await manager.evaluate(`(() => {const host=document.querySelector(${JSON.stringify(mapper(system))}),panel=document.querySelector('.system-mapping-panel'),grid=document.querySelector('.systems>ul'),control=host.querySelector('.cl-control-list [data-input-index]');return {system:${JSON.stringify(system)},input:control?Number(control.dataset.inputIndex):null,action:control?.firstChild.textContent,original:control?.querySelector('.cl-binding').textContent,name:host.querySelector('.cl-controller-name').textContent,hotspots:host.querySelectorAll('.cl-hotspot').length,openPanels:document.querySelectorAll('.system-open[aria-expanded="true"]').length,panelWidth:panel.getBoundingClientRect().width,gridWidth:grid.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth-innerWidth};})()`);
    assert.ok(detail.name, 'Each system must display its hardware diagram.'); if(detail.input === null){assert.equal(system,'cdi'); mappings.push({...detail,illustrationOnly:true}); continue;} assert.ok(detail.hotspots > 0);
    assert.equal(detail.openPanels, 1); assert.ok(Math.abs(detail.panelWidth - detail.gridWidth) < 2); assert.ok(detail.overflow <= 1);
    const selectedControl = mapper(system) + ` .cl-control-list [data-input-index="${detail.input}"]`;
    await manager.click(selectedControl);
    await manager.click(mapper(system) + ' [data-key="."]');
    const binding = () => manager.evaluate(`document.querySelector(${JSON.stringify(selectedControl + ' .cl-binding')}).textContent`);
    assert.equal(await binding(), '.', 'Native keyboard-diagram click must update the selected action.');
    assert.ok(await manager.evaluate(`[...document.querySelectorAll(${JSON.stringify(mapper(system) + ' [data-key="."] .cl-key-action')})].some(e=>e.textContent===${JSON.stringify(detail.action)})`), 'Keyboard action label must update immediately.');
    await openSystem(SYSTEM_IDS[(index + 1) % SYSTEM_IDS.length]);
    await openSystem(system);
    assert.equal(await binding(), '.', 'Unsaved mapping must survive switching systems.');
    await mapperButton(system, 'Save keyboard mapping');
    await manager.poll(`[...document.querySelector(${JSON.stringify(mapper(system))}).querySelectorAll('p')].some(e=>e.textContent.startsWith('Saved.'))`, 'saved mapping for ' + system);
    assert.equal((await library()).controls[system][detail.input], '.', 'Saved mapping must reach the packaged service.');
    mappings.push({ ...detail, remappedKey: '.', switchPreserved: true, saved: true });
    log({ controllerPassed: system });
  }
  await manager.command('Page.reload'); await loaded();
  for (const detail of mappings) {
    await openSystem(detail.system);
    if (detail.illustrationOnly) continue;
    assert.equal(await manager.evaluate(`document.querySelector(${JSON.stringify(mapper(detail.system) + ` .cl-control-list [data-input-index="${detail.input}"] .cl-binding`)}).textContent`), '.');
    assert.ok(await manager.evaluate(`[...document.querySelectorAll(${JSON.stringify(mapper(detail.system) + ' [data-key="."] .cl-key-action')})].some(e=>e.textContent===${JSON.stringify(detail.action)})`));
    detail.reloadPreserved = true;
  }
  await openSystem('n64'); await manager.screenshot('02-controller-n64');
  await openSystem('nes');
  await mapperButton('nes', 'Reset controller keys');
  const nes = mappings.find(item => item.system === 'nes');
  assert.equal(await manager.evaluate(`document.querySelector(${JSON.stringify(mapper('nes') + ` .cl-control-list [data-input-index="${nes.input}"] .cl-binding`)}).textContent`), nes.original);
  await mapperButton('nes', 'Save keyboard mapping');
  await manager.poll(`[...document.querySelector(${JSON.stringify(mapper('nes'))}).querySelectorAll('p')].some(e=>e.textContent.startsWith('Saved.'))`, 'saved reset');
  checks.controllers = { systems: mappings, resetSaved: (await library()).controls.nes[nes.input] === nes.original, physicalControllerGameplay: 'not-tested' };
  assert.equal(checks.controllers.resetSaved, true);

  phase = 'navigation-and-settings';
  await manager.click('.system-mapping-header button');
  assert.equal(await manager.evaluate("document.querySelector('.system-mapping-panel').hidden"), true);
  await openSystem('nes');
  await manager.key('Escape', 'Escape', 27);
  assert.equal(await manager.evaluate("document.querySelector('.system-mapping-panel').hidden"), true, 'Escape closes mapping and restores focus.');
  assert.equal(await manager.evaluate("document.activeElement.matches('.system-open')"), true);
  await manager.key('Tab', 'Tab', 9);
  const focus = await manager.evaluate("({tag:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineStyle})");
  assert.notEqual(focus.tag, 'BODY');
  await manager.click('.settings-tab summary');
  await manager.evaluate("document.querySelector('#font-family').value='mono';document.querySelector('#font-family').dispatchEvent(new Event('change'));document.querySelector('#font-size').value='18';document.querySelector('#font-size').dispatchEvent(new Event('input'));document.querySelector('#color-scheme').value='ocean';document.querySelector('#color-scheme').dispatchEvent(new Event('change'))");
  for (const selector of ['#compact-layout', '#reduce-motion', '#remember-systems']) await manager.click(selector);
  await openSystem('nes');
  await manager.command('Page.reload'); await loaded();
  const settings = await manager.evaluate("({font:document.querySelector('#font-family').value,size:document.querySelector('#font-size').value,color:document.querySelector('#color-scheme').value,compact:document.body.classList.contains('compact-layout'),motion:document.body.classList.contains('reduce-motion'),remember:document.querySelector('#remember-systems').checked,expanded:document.querySelector('.system-open[aria-expanded=true]')?.closest('[data-system-id]').dataset.systemId})");
  assert.deepEqual(settings, { font: 'mono', size: '18', color: 'ocean', compact: true, motion: true, remember: true, expanded: 'nes' });
  await manager.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const responsive = [];
  for (const width of [820, 560, 375, 320]) {
    await manager.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await pause(100);
    const geometry = await manager.evaluate("({overflow:document.documentElement.scrollWidth-innerWidth,panelWidth:document.querySelector('.system-mapping-panel').getBoundingClientRect().width,gridWidth:document.querySelector('.systems>ul').getBoundingClientRect().width})");
    assert.ok(geometry.overflow <= 1, JSON.stringify({ width, ...geometry }));
    assert.ok(Math.abs(geometry.panelWidth - geometry.gridWidth) < 2);
    responsive.push({ width, ...geometry });
  }
  await manager.command('Emulation.clearDeviceMetricsOverride');
  await manager.click('.system-mapping-header button');
  await manager.click('.settings-tab summary');
  await manager.screenshot('03-settings');
  checks.navigationAndSettings = { ...settings, nativeTab: focus, nativeEscape: true, responsive };

  phase = 'synthetic-rom-import';
  await manager.evaluate(`document.querySelector('#source').value=${JSON.stringify(roots.fixtures)}`);
  const importViaUI = async () => {
    await manager.click('#sync');
    await manager.poll("!document.querySelector('#sync').disabled && document.querySelector('#status').dataset.state==='success'", 'successful import UI', 30_000);
    return library();
  };
  const imported = await importViaUI();
  const paired = JSON.parse(await readFile(join(dataRoot, 'paired-wallpaper.json'), 'utf8'));
  assert.equal((await realpath(paired.wallpaperPath)).toLowerCase(), (await realpath(playerRoot)).toLowerCase(), 'Import must target the isolated bundled player.');
  assert.equal(imported.manifest.nes.length, 1);
  assert.equal(imported.report.imported.length, 1);
  const importedPath = resolve(playerRoot, imported.manifest.nes[0]);
  assert.equal(within(playerRoot, importedPath), true, 'Fixture must be copied inside this isolated player.');
  assert.deepEqual(await readFile(importedPath), fixtureBytes, 'Imported bytes must exactly match the generated fixture.');
  const scannedAgain = await importViaUI();
  assert.equal(scannedAgain.manifest.nes.length, 1); assert.equal(scannedAgain.report.imported.length, 0); assert.equal(scannedAgain.report.alreadyImported.length, 1);
  await manager.command('Page.reload'); await loaded(); await openSystem('nes');
  assert.equal(await manager.evaluate("document.querySelector('#source').value"), roots.fixtures);
  assert.ok(await manager.evaluate("[...document.querySelectorAll('[data-system-details=nes] .system-games li')].some(e=>e.textContent==='Synthetic import fixture')"), 'The persisted import must be visible in the actual Manager library.');
  await manager.screenshot('04-synthetic-library');
  checks.import = { kind: 'synthetic-import-only', filename: fixtureName, sha256: fixtureSha256, importedExactlyOnce: true, duplicateSkipped: true, sourceAndLibrarySurviveReload: true, bytePreservingCopy: true, playable: false };

  phase = 'standalone-player-launch';
  await manager.click('#open-player');
  const playerTarget = await eventually(async () => (await targets()).find(item => item.type === 'page' && item.url.includes('standalone=1')), 'standalone player window', 30_000);
  const playerURL = new URL(playerTarget.url);
  assert.equal(playerURL.protocol, 'file:');
  assert.equal(within(playerRoot, fileURLToPath(playerURL)), true, 'Standalone player must use the isolated runtime.');
  const player = await attach(playerTarget, 'player');
  await player.poll("document.body.classList.contains('standalone-player') && document.querySelector('#standalone-game-screen')?.width>0 && typeof window.livelyPropertyListener==='function'", 'standalone selector canvas', 30_000);
  const playerState = await player.evaluate("({title:document.title,canvas:{width:document.querySelector('#standalone-game-screen').width,height:document.querySelector('#standalone-game-screen').height},iframes:document.querySelectorAll('iframe').length})");
  assert.equal(playerState.iframes, 0, 'Synthetic import fixture must never be launched as a game.');
  await player.screenshot('05-standalone-selector');
  const selectorBefore = await player.evaluate("document.querySelector('#standalone-game-screen').toDataURL()");
  await player.key('ArrowDown', 'ArrowDown', 40);
  await player.poll(`document.querySelector('#standalone-game-screen').toDataURL()!==${JSON.stringify(selectorBefore)}`, 'native selector keyboard response');
  await manager.evaluate("document.querySelector('#crt-blur').value='2';document.querySelector('#crt-blur').dispatchEvent(new Event('input'))");
  await manager.click('#crt-monochrome');
  await player.poll("getComputedStyle(document.querySelector('#standalone-game-screen')).filter==='blur(1px)' && getComputedStyle(document.documentElement).filter==='grayscale(1)'", 'live standalone display preferences');
  assert.equal(await manager.evaluate("document.querySelector('#display-hue').disabled && document.querySelector('#display-saturation').disabled"), true);
  await player.screenshot('06-standalone-live-settings');
  await manager.click('#reset-colors');
  await player.poll("getComputedStyle(document.documentElement).filter==='none' && getComputedStyle(document.querySelector('#standalone-game-screen')).filter==='blur(1px)'", 'color reset retaining softness');
  const closeResponse = await fetch(`http://127.0.0.1:${port}/json/close/${encodeURIComponent(playerTarget.id)}`, { signal: AbortSignal.timeout(5000) });
  assert.equal(closeResponse.ok, true, 'CDP must close only this player target.');
  await eventually(async () => !(await targets()).some(item => item.id === playerTarget.id), 'player target to disappear');
  await manager.poll("fetch('/api/v1/player-status').then(r=>r.json()).then(p=>p.open===false)", 'Manager acknowledges player exit');
  assert.equal(await manager.evaluate("document.querySelectorAll('.cl-mapper').length"), 21, 'Manager stays usable after player exit.');
  checks.player = { ...playerState, isolatedRuntime: true, selectorCanvasOpened: true, nativeSelectorArrowDispatched: true, liveSoftnessAndMonochrome: true, colorReset: true, exitConfirmedByService: true, coreBoot: 'not-tested', gameplay: 'not-tested: synthetic import fixture has no game program', savePersistence: 'not-tested: no game launched' };

  phase = 'final-isolation-and-resource-checks';
  const normalRequests = [...new Set([...manager.requests, ...player.requests])];
  assert.deepEqual(normalRequests.filter(url => /manager-garden|packages\/garden|garden-play-credit/i.test(url)), [], 'Normal Manager/player loading must never request garden resources.');
  assert.equal(await manager.evaluate("fetch('/manager-garden/manager/entry.js').then(r=>r.status)"), 404, 'Garden resource route must be unavailable in Manager.');
  const profileFiles = await filePaths(roots.local);
  assert.deepEqual(profileFiles.filter(path => /(?:^|\/)garden[^/]*(?:\/|$)/i.test(path)), [], 'Manager must not create garden state.');
  assert.deepEqual(profileFiles.filter(path => /(?:^|\/)(?:Saves|Backups)\/.+/i.test(path)), [], 'No emulator save files should be created without gameplay.');
  assert.equal(livelyProcesses(), beforeLively, 'Lively process IDs must remain unchanged.');
  assert.deepEqual(errors.filter(error => error.target === 'manager'), [], 'Manager must have no uncaught renderer exceptions.');
  checks.isolation = { freshProfile: true, gardenResourcesRequested: false, gardenRouteStatus: 404, gardenStateCreated: false, emulatorSaveFilesCreated: false, livelyProcessesUnchanged: true };
  await writeFile(join(output, 'resource-requests.json'), JSON.stringify(normalRequests, null, 2));
  await writeFile(join(output, 'renderer-exceptions.json'), JSON.stringify(errors, null, 2));
  result = { passed: true, executable, pid: child.pid, output, normalPackagedEntry: true, checks, limitations: ['Generated ROM verifies import/catalog/deduplication only.', 'No core boot, playable ROM, BIOS-dependent system, physical controller, save/reload, installer, clean-machine, or installed-Lively acceptance is claimed.'] };
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ phase, error: String(error.stack || error), executable, pid: child?.pid, completedChecks: checks, rendererExceptions: errors }, null, 2));
  throw error;
} finally {
  clearTimeout(watchdog);
  for (const session of sessions) session.socket.close();
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    terminateChild();
    const exited = await Promise.race([new Promise(done => child.once('exit', () => done(true))), pause(5000).then(() => child.exitCode !== null || child.signalCode !== null)]);
    assert.equal(exited, true, 'Acceptance child must exit before the harness finishes.');
  }
  await writeFile(join(output, 'cleanup.json'), JSON.stringify({ pid: child?.pid, exactChildOnly: true, exitCode: child?.exitCode, signalCode: child?.signalCode, artifactsRetained: true }, null, 2));
}
await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: true, output, controllers: checks.controllers.systems.length, syntheticImport: true, playerLaunchAndExit: true, actualGameplay: false }));

