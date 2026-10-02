import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { renderManagerPage } from '../manager/page.js';

async function displayHarness() {
  const source=await readFile(new URL('../manager/page.js',import.meta.url),'utf8');
  const start=source.indexOf('const fontFamilies=');
  const end=source.indexOf("document.querySelector('#choose-source')",start);
  assert.ok(start>=0 && end>start);
  const storage=new Map();const requests=[];const statuses=[];
  const controls=Object.fromEntries(['font-family','font-size','crt-blur','crt-monochrome','crt-sepia','display-hue','display-saturation','display-contrast','display-hue-value','display-saturation-value','display-contrast-value','reset-colors'].map(id=>[id,{value:'',checked:false,events:new Map(),addEventListener(type,handler){this.events.set(type,handler);}}]));
  const document={querySelector:selector=>controls[selector.slice(1)],documentElement:{style:{setProperty(){}}}};
  runInNewContext(source.slice(start,end),{
    document,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,String(value))},
    AbortSignal:{timeout:milliseconds=>({milliseconds})},
    setStatus:(message,state)=>statuses.push({message,state}),
    fetch:(url,options)=>url==='/api/v1/display-settings'?Promise.resolve({ok:true,json:async()=>({saved:false})}):new Promise((resolve,reject)=>requests.push({url,settings:JSON.parse(options.body),options,resolve,reject})),
  });
  const input=value=>{controls['crt-blur'].value=String(value);controls['crt-blur'].events.get('input')();};
  return {controls,storage,requests,statuses,input};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('held-slider input persists immediately and queues the latest value without release or focus changes',async()=>{
  const h=await displayHarness();
  assert.equal(h.controls['crt-blur'].events.has('change'),false);
  h.input(1.25);
  assert.deepEqual(h.requests[0].settings,{blur:1.25,monochrome:false,sepia:false,hue:0,saturation:100,contrast:100});
  h.input(2);h.input(3.25);
  assert.equal(h.storage.get('manager-crt-blur'),'3.25');
  assert.equal(h.requests.length,1,'Updates serialize while an earlier request is outstanding');
  h.requests[0].resolve({ok:true});await flush();
  assert.deepEqual(h.requests[1].settings,{blur:3.25,monochrome:false,sepia:false,hue:0,saturation:100,contrast:100});
  assert.equal(h.requests[1].url,'/api/v1/player-settings');
  assert.equal(h.requests[1].options.signal.milliseconds,2000);
  h.requests[1].resolve({ok:true});await flush();
  h.input(2.5);
  assert.equal(h.requests[2].settings.blur,2.5,'Further input continues without a change/mouseup event');
  h.requests[2].resolve({ok:true});await flush();
});

test('Sepia and monochrome exclude each other, hue updates live, and reset preserves softness',async()=>{
  const h=await displayHarness();
  h.controls['crt-sepia'].checked=true;h.controls['crt-sepia'].events.get('change')();
  assert.equal(h.requests[0].settings.sepia,true);h.requests[0].resolve({ok:true});await flush();
  h.controls['display-hue'].value='35';h.controls['display-hue'].events.get('input')();
  assert.equal(h.requests[1].settings.hue,35);h.requests[1].resolve({ok:true});await flush();
  h.controls['crt-monochrome'].checked=true;h.controls['crt-monochrome'].events.get('change')();
  assert.equal(h.controls['crt-sepia'].checked,false);assert.equal(h.controls['display-hue'].disabled,true);
  h.requests[2].resolve({ok:true});await flush();
  h.controls['crt-blur'].value='3';h.controls['reset-colors'].events.get('click')();
  assert.deepEqual(h.requests[3].settings,{blur:3,monochrome:false,sepia:false,hue:0,saturation:100,contrast:100});
  assert.equal(h.controls['display-hue'].disabled,false);h.requests[3].resolve({ok:true});await flush();
});

test('a failed update does not discard the latest queued input or block later controls',async()=>{
  const h=await displayHarness();h.input(1);h.input(2.75);
  h.requests[0].reject(new Error('Timed out'));await flush();
  assert.equal(h.statuses[0].state,'error');
  assert.equal(h.requests[1].settings.blur,2.75);
  h.requests[1].resolve({ok:true});await flush();
  h.controls['crt-monochrome'].checked=true;
  h.controls['crt-monochrome'].events.get('change')();
  assert.equal(h.requests[2].settings.monochrome,true);
  h.requests[2].resolve({ok:true});await flush();
});

test('system hover changes decoration rather than layout and details remain explicit',()=>{
  const html=renderManagerPage({dataRoot:'fixture',appName:'RetroSignal'});
  const css=[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match=>match[1]).join('\n');
  assert.match(css,/\.systems \.system-open small\{display:block;opacity:0;transition:opacity 160ms ease\}/);
  assert.match(css,/\.system-open:hover small,\.systems \.system-open:focus-visible small\{opacity:1\}/);
  assert.doesNotMatch(css,/\.systems[^{}]*:hover[^{}]*\.(?:system-games|system-summary)/);
  const geometry=/\b(?:transform|height|min-height|max-height|width|min-width|max-width|padding|margin|position|top|left|right|bottom|border-width)\s*:/;
  for(const [,selector,declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    if(selector.includes('.systems') && /:hover|:focus-within/.test(selector))assert.doesNotMatch(declarations,geometry,selector);
  }
  assert.match(html,/aria-expanded="false" onclick="const details=this.nextElementSibling;details.hidden=!details.hidden/);
  assert.match(css,/:focus-visible\{outline:2px solid/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
