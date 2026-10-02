import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { normalizePlayerSettings, playerSettingsScript } from '../manager/player-settings.mjs';

test('a legacy runtime without the standalone canvas keeps its internal blur', () => {
  const applied = []; const events = [];
  const document = { documentElement: { style: {} }, querySelector: () => null };
  const window = { livelyPropertyListener: (...args) => applied.push(args), dispatchEvent: event => events.push(event) };
  class CustomEvent { constructor(type, options) { this.detail = options.detail; } }
  runInNewContext(playerSettingsScript({ blur: 3 }), { window, document, CustomEvent });
  assert.deepEqual(applied, [['crtBlur', 1.5]]); assert.equal(events[0].detail.crtBlur, 1.5);
});

test('live display settings reach legacy property handlers without a modern event subscriber', () => {
  const applied = []; const events = [];
  const canvas = { style: {} };
  const document = { documentElement: { style: {} }, querySelector: () => canvas };
  const window = { livelyPropertyListener: (...args) => applied.push(args), dispatchEvent: event => events.push(event) };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  runInNewContext(playerSettingsScript({ blur: 2.75, monochrome: true }), { window, document, CustomEvent });
  assert.deepEqual(applied, [['crtBlur', 0]]);
  assert.equal(canvas.style.filter, 'blur(1.375px)');
  assert.equal(document.documentElement.style.filter, 'grayscale(1)');
  assert.equal(events[0].detail.crtBlur, 0);
  runInNewContext(playerSettingsScript({ blur: 0, monochrome: false }), { window, document, CustomEvent });
  assert.equal(document.documentElement.style.filter, 'none');
  assert.equal(canvas.style.filter, 'none');
  assert.deepEqual(applied.at(-1), ['crtBlur', 0]);
});

test('display settings remain bounded and current event-only runtimes are supported', () => {
  const events = []; const canvas = { style: {} }; const document = { documentElement: { style: {} }, querySelector: () => canvas };
  const window = { dispatchEvent: event => events.push(event) };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  runInNewContext(playerSettingsScript({ blur: 99, monochrome: false }), { window, document, CustomEvent });
  assert.equal(events[0].detail.crtBlur, 0);
  assert.equal(canvas.style.filter, 'blur(2px)');
  assert.equal(document.documentElement.style.filter, 'none');
});

test('colors default to neutral, compose in order and monochrome takes precedence over Sepia',()=>{
  assert.deepEqual(normalizePlayerSettings(),{blur:1,monochrome:false,sepia:false,hue:0,saturation:100,contrast:100});
  const document={documentElement:{style:{}},querySelector:()=>({style:{}})};
  const window={dispatchEvent:()=>{document.documentElement.style.filter='none';}};
  class CustomEvent {constructor(type,options){this.detail=options.detail;}}
  runInNewContext(playerSettingsScript({sepia:true,hue:20,saturation:80,contrast:110}),{document,window,CustomEvent});
  assert.equal(document.documentElement.style.filter,'sepia(1) hue-rotate(20deg) saturate(0.8) contrast(1.1)');
  runInNewContext(playerSettingsScript({monochrome:true,sepia:true,hue:20,saturation:80,contrast:110}),{document,window,CustomEvent});
  assert.equal(document.documentElement.style.filter,'grayscale(1) contrast(1.1)');
  runInNewContext(playerSettingsScript({}),{document,window,CustomEvent});
  assert.equal(document.documentElement.style.filter,'none');
  assert.deepEqual(normalizePlayerSettings({hue:999,saturation:-2,contrast:999}),{blur:1,monochrome:false,sepia:false,hue:180,saturation:0,contrast:150});
});
