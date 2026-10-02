// Explicit acceptance check: node tests/packaged-manager-smoke.mjs <exe>
// Runs the actual packaged entry with its normal bundled runtime and isolated
// data. No source import, UI substitution, games, or Lively commands are used.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { appendFileSync } from 'node:fs';

const executable = resolve(process.argv[2] || 'dist/color-controls-build/win-unpacked/RetroSignal Manager.exe');
const output = resolve(process.env.RETROSIGNAL_PACKAGED_SMOKE_OUTPUT || 'dist/packaged-manager-smoke');
assert.equal(process.env.RETROSIGNAL_ALLOW_VISIBLE_GUI_TEST, '1', 'Packaged GUI tests open visible windows. Coordinate with the user and explicitly opt in before running.');
await mkdir(output, { recursive: true });
const testPlayerControls = process.env.RETROSIGNAL_TEST_PLAYER_CONTROLS === '1';
if (testPlayerControls) {
  const legacyRuntime = resolve(output, 'legacy-library-fixture');
  await cp(join(dirname(executable), 'resources', 'player-runtime'), legacyRuntime, { recursive: true });
  const script = join(legacyRuntime, 'js', 'retrosignal.js');
  const source = await readFile(process.env.RETROSIGNAL_LEGACY_SCRIPT || script, 'utf8');
  const stripped = source.replace(/window\.addEventListener\("retrosignal-settings", \(event\) => \{[\s\S]*?\n\}\);/, '');
  assert.ok(!stripped.includes('window.addEventListener("retrosignal-settings"'), 'Legacy fixture must omit the newer settings subscription');
  await writeFile(script, stripped);
  const data = resolve(output, 'local-app-data', 'RetroSignal');
  await mkdir(data, { recursive: true });
  await writeFile(join(data, 'paired-wallpaper.json'), JSON.stringify({ wallpaperPath: legacyRuntime }));
}
const livelySnapshot = () => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  "@(Get-Process -Name 'Lively' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id | Sort-Object) | ConvertTo-Json -Compress"], { windowsHide: true, timeout: 10_000 }).toString().trim();
const before = livelySnapshot();
const listener = createServer();
await new Promise(resolveListen => listener.listen(0, '127.0.0.1', resolveListen));
const port = listener.address().port;
await new Promise(resolveClose => listener.close(resolveClose));
const child = spawn(executable, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${resolve(output, 'chromium-user-data')}`], {
  windowsHide: true,
  env: { ...process.env, LOCALAPPDATA: resolve(output, 'local-app-data'), APPDATA: resolve(output, 'roaming-app-data') },
  stdio: 'ignore',
});
let childError;
child.on('error', error => { childError = error; });
await writeFile(join(output, 'launch.json'), JSON.stringify({ executable, pid:child.pid, startedUTC:new Date().toISOString(), profile:resolve(output,'chromium-user-data'), temporaryDataRoot:resolve(output,'local-app-data'), testPlayerControls }, null, 2));
let socket;
let phase = 'startup';
const watchdog=setTimeout(()=>{
  appendFileSync(join(output,'commands.jsonl'),JSON.stringify({phase,budgetExpired:true,UTC:new Date().toISOString()})+'\n');
  if(child.pid && child.exitCode===null) execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
},30_000);
try {
  let target;
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (childError) throw childError;
    if (child.exitCode !== null) throw new Error(`Packaged Manager exited: ${child.exitCode}`);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
      target = targets.find(item => item.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(item.url));
      if (target) break;
    } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  assert.ok(target, 'Actual packaged Manager must load its loopback interface');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const command = (method, params = {}) => new Promise((resolveResult, reject) => {
    const id = ++sequence;
    appendFileSync(join(output,'commands.jsonl'),JSON.stringify({phase,id,method,issuedUTC:new Date().toISOString(),x:params.x,y:params.y,buttons:params.buttons})+'\n');
    const timeout = setTimeout(() => reject(new Error('Packaged UI command timed out in '+phase+': '+method+' '+String(params.expression || '').slice(0,120))), 5000);
    const receive = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timeout); socket.removeEventListener('message', receive);
      appendFileSync(join(output,'commands.jsonl'),JSON.stringify({phase,id,method,completedUTC:new Date().toISOString(),error:message.error})+'\n');
      if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message)));
      else resolveResult(message.result);
    };
    socket.addEventListener('message', receive);
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => (await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  let ui;
  const uiStarted = Date.now();
  while (Date.now() - uiStarted < 15_000) {
    try {
      ui = await evaluate(`document.readyState === 'complete' && document.querySelector('#status')?.textContent.includes('Player library connected') ? ({ title:document.title, status:document.querySelector('#status').textContent, openLively:document.querySelector('#open-lively')?.textContent, player:!!document.querySelector('#open-player'), garden:!!document.querySelector('[data-manager-view=garden]') }) : null`);
      if (ui) break;
    } catch (error) {
      if (!error.message.includes('Execution context was destroyed')) throw error;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  assert.ok(ui, 'Actual packaged interface must finish loading and connect its player library');
  assert.match(ui.title, /RetroSignal Manager/);
  assert.equal(ui.openLively, 'Open Lively');
  assert.equal(ui.player, true);
  assert.equal(ui.garden, true);
  const health = await (await fetch(`${target.url}health`)).json();
  assert.equal(health.name, 'RetroSignal Manager');
  let playerControls;
  if (testPlayerControls) {
    phase='open-isolated-player';
    const managerSocket = socket;
    await evaluate("document.querySelector('#crt-blur').value='0'; document.querySelector('#crt-monochrome').checked=false; document.querySelector('#open-player').click()");
    let playerTarget;
    const playerStarted = Date.now();
    while (Date.now() - playerStarted < 15_000) {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      playerTarget = targets.find(item => item.type === 'page' && item.url.includes('standalone=1'));
      if (playerTarget) break;
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    assert.ok(playerTarget, 'Packaged player must open the selected legacy library');
    socket = new WebSocket(playerTarget.webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const playerSocket = socket;
    const readyStarted = Date.now();
    let playerReady;
    while (Date.now() - readyStarted < 15_000) {
      try { playerReady = await evaluate("!!document.querySelector('#standalone-game-screen') && typeof window.livelyPropertyListener === 'function'"); if(playerReady) break; } catch(error) { if(!error.message.includes('Execution context was destroyed')) throw error; }
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    assert.ok(playerReady);
    await evaluate("window.__appliedBlur=null; const original=window.livelyPropertyListener; window.livelyPropertyListener=(name,value)=>{ if(name==='crtBlur') window.__appliedBlur=value; return original(name,value); }");
    const beforeImage = (await command('Page.captureScreenshot')).data;
    socket = managerSocket;
    await evaluate("document.querySelector('#crt-blur').value='4'; document.querySelector('#crt-blur').dispatchEvent(new Event('input')); document.querySelector('#crt-monochrome').checked=true; document.querySelector('#crt-monochrome').dispatchEvent(new Event('change'))");
    socket = playerSocket;
    let applied;
    const appliedStarted = Date.now();
    while(Date.now()-appliedStarted<10_000) {
      applied=await evaluate("({blur:getComputedStyle(document.querySelector('#standalone-game-screen')).filter,innerBlur:window.__appliedBlur,filter:getComputedStyle(document.documentElement).filter})");
      if(applied.blur==='blur(2px)' && applied.filter==='grayscale(1)') break;
      await new Promise(resolveWait=>setTimeout(resolveWait,100));
    }
    assert.equal(applied.blur,'blur(2px)'); assert.equal(applied.innerBlur,0); assert.equal(applied.filter,'grayscale(1)');
    const afterImage=(await command('Page.captureScreenshot')).data;
    assert.notEqual(afterImage,beforeImage,'Black and white must change actual packaged player rendering');
    await writeFile(join(output,'player-color.png'),Buffer.from(beforeImage,'base64'));
    await writeFile(join(output,'player-monochrome.png'),Buffer.from(afterImage,'base64'));
    socket=managerSocket;
    await evaluate("document.querySelector('#crt-blur').value='0'; document.querySelector('#crt-blur').dispatchEvent(new Event('input')); document.querySelector('#crt-monochrome').checked=false; document.querySelector('#crt-monochrome').dispatchEvent(new Event('change'))");
    socket=playerSocket;
    const resetStarted=Date.now(); let reset;
    while(Date.now()-resetStarted<10_000){ reset=await evaluate("({blur:getComputedStyle(document.querySelector('#standalone-game-screen')).filter,filter:getComputedStyle(document.documentElement).filter})"); if(reset.blur==='none' && reset.filter==='none')break; await new Promise(resolveWait=>setTimeout(resolveWait,100)); }
    assert.equal(reset.blur,'none'); assert.equal(reset.filter,'none');
    // Normal coordinated tests show the regular selector. Contrast fixtures
    // require a separate explicit opt-in because they are visually intrusive.
    if(process.env.RETROSIGNAL_CONTRAST_FIXTURE==='1') await evaluate("const canvas=document.querySelector('#standalone-game-screen');const ctx=canvas.getContext('2d');ctx.fillStyle='#101010';ctx.fillRect(0,0,canvas.width,canvas.height);for(let x=0;x<canvas.width;x+=16){ctx.fillStyle=x%32===0?'#ffffff':'#101010';ctx.fillRect(x,0,8,canvas.height)}");
    phase='drag-softness-before-release';
    const dragImages=[];
    const dragValues=[];
    socket=managerSocket;
    const range=await evaluate("document.querySelector('#crt-blur').scrollIntoView({block:'center'}); const box=document.querySelector('#crt-blur').getBoundingClientRect();({x:box.x,y:box.y,width:box.width,height:box.height})");
    const y=range.y+range.height/2;
    await command('Input.dispatchMouseEvent',{type:'mousePressed',x:range.x+8,y,button:'left',buttons:1,clickCount:1});
    for(const fraction of [0.25,0.5,0.75]) {
      socket=managerSocket;
      await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:range.x+8+(range.width-16)*fraction,y,button:'left',buttons:1});
      const value=await evaluate("({blur:Number(document.querySelector('#crt-blur').value),saved:localStorage.getItem('manager-crt-blur')})");
      assert.ok(value.blur>0 && value.blur<4,'Intermediate dragged value must be emitted before release');
      assert.equal(Number(value.saved),value.blur);
      socket=playerSocket;
      const expected='blur('+(value.blur*0.5)+'px)';
      const changeStarted=Date.now();let rendered;
      while(Date.now()-changeStarted<5000){rendered=await evaluate("getComputedStyle(document.querySelector('#standalone-game-screen')).filter");if(rendered===expected)break;await new Promise(resolveWait=>setTimeout(resolveWait,30));}
      assert.equal(rendered,expected);
      dragImages.push((await command('Page.captureScreenshot')).data);dragValues.push(value.blur);
    }
    socket=managerSocket;
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:range.x+8+(range.width-16)*0.75,y,button:'left',buttons:0,clickCount:1});
    assert.equal(new Set(dragValues).size,3);
    assert.equal(new Set(dragImages).size,3,'All intermediate drag values must produce visibly different pixels before release');
    for(let i=0;i<dragImages.length;i++) await writeFile(join(output,'player-drag-'+dragValues[i]+'.png'),Buffer.from(dragImages[i],'base64'));
    playerControls={legacyRuntime:true,exactLegacyScript:!!process.env.RETROSIGNAL_LEGACY_SCRIPT,liveSoftness:true,liveMonochromeRendering:true,reset:true,dragValues,distinctRenderedDragFrames:true,noGameLaunched:true};
    playerSocket.close(); socket=managerSocket;
  }
  // Hover must not change layout or move the page under a fast-moving pointer.
  phase='rapid-system-hover';
  await evaluate("document.querySelector('.systems').scrollIntoView({block:'start'})");
  const geometry=await evaluate("JSON.stringify({root:getComputedStyle(document.documentElement).transform,body:getComputedStyle(document.body).transform,scroll:scrollY,boxes:Array.from(document.querySelectorAll('.systems > ul > li')).map(item=>{const b=item.getBoundingClientRect();return [b.x,b.y,b.width,b.height]})})");
  const buttons=await evaluate("Array.from(document.querySelectorAll('.system-open')).map(item=>{const b=item.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}}).filter(point=>point.y>0&&point.y<innerHeight).slice(0,6)");
  assert.ok(buttons.length>1);
  for(let sweep=0;sweep<3;sweep++)for(const point of [...buttons,...buttons.toReversed()]) {
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
    assert.equal(await evaluate("JSON.stringify({root:getComputedStyle(document.documentElement).transform,body:getComputedStyle(document.body).transform,scroll:scrollY,boxes:Array.from(document.querySelectorAll('.systems > ul > li')).map(item=>{const b=item.getBoundingClientRect();return [b.x,b.y,b.width,b.height]})})"),geometry,'Rapid hover must preserve card geometry and scroll position');
  }
  phase='keyboard-and-reduced-motion';
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  const focus=await evaluate("(()=>{const button=document.querySelector('.system-open');button.focus();return {outline:getComputedStyle(button).outlineStyle,width:getComputedStyle(button).outlineWidth,motion:matchMedia('(prefers-reduced-motion:reduce)').matches,animation:getComputedStyle(button).animationName};})()");
  assert.equal(focus.outline,'solid');assert.equal(focus.width,'2px');assert.equal(focus.motion,true);assert.equal(focus.animation,'none');
  assert.equal(await evaluate("(()=>{const button=document.querySelector('.system-open');button.click();return button.getAttribute('aria-expanded')==='true'&&!button.nextElementSibling.hidden;})()"),true,'System details remain available on click');
  const hoverStability={rapidSweeps:3,stableCardBounds:true,stableRootTransforms:true,stableScroll:true,keyboardFocusVisible:true,reducedMotionRespected:true,clickExpansion:true};
  assert.equal(livelySnapshot(), before, 'Packaged startup must leave Lively processes unchanged');
  const result = { passed: true, executable, pid: child.pid, normalPackagedEntry: true, ui, health, playerControls, hoverStability, livelyProcessesUnchanged: true };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch(error) {
  await writeFile(join(output,'failure.json'),JSON.stringify({phase,error:String(error.stack || error),failedUTC:new Date().toISOString(),executable,pid:child.pid},null,2));
  throw error;
} finally {
  clearTimeout(watchdog);
  socket?.close();
  // Terminate only this isolated test process and its own Electron children.
  if (child.pid && child.exitCode === null) execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
}
