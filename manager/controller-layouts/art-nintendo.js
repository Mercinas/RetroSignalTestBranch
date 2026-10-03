import { getLayeredN64Art } from './art-n64-layered.js';
// Original hardware-inspired, unbranded vector drawings. Coordinates are not CAD dimensions.
// See docs/controller-references-nintendo.md. Physical footprints stay separate from hit targets.
const text = (x, y, value, size = 10, fill = '#343945') => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" font-weight="700" fill="${fill}">${value}</text>`;
const rect = (x, y, w, h, r, fill, stroke = '#343945', sw = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const circle = (x, y, r, fill, stroke = '#343945', sw = 2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const footprint = (x, y, width, height = width) => ({ x, y, width, height });
function roundButton(x, y, r, fill, label, labelFill = '#f4f5fa') {
  return circle(x, y + .7, r + 1.7, '#585b60', '#929499', .7) + circle(x, y, r, fill, '#353843', .65) + (label ? text(x, y + 4, label, Math.max(9, r * .7), labelFill) : '');
}
function dpad(x, y, s = 1, ids = [4, 5, 6, 7]) {
  const controls = Object.fromEntries([[ids[0], x, y - 20*s], [ids[1], x, y + 20*s], [ids[2], x - 20*s, y], [ids[3], x + 20*s, y]].map(([id,cx,cy]) => [id, footprint(cx, cy, 19*s, 19*s)]));
  const body = `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-11 -33H11V-11H33V11H11V33H-11V11H-33V-11H-11Z" fill="#282b30" stroke="#101318" stroke-width="2"/><path d="M-9 -30H9M-30 -9H-13M13 -9H30" fill="none" stroke="#666971" stroke-width="2"/><circle r="7" fill="#202329" stroke="#454952"/><path d="M0 -26l-4 6h8zM0 26l-4 -6h8zM-26 0l6 -4v8zM26 0l-6 -4v8z" fill="#5f636b"/></g>`;
  return { body, controls };
}
function nes() {
  const p = dpad(137, 192, 1.28);
  const controls = { ...p.controls, 2: footprint(261, 217, 42, 13), 3: footprint(324, 217, 42, 13), 0: footprint(408, 211, 42), 8: footprint(482, 211, 42) };
  return { name: 'NES · original rectangular controller', controls, body:
    `<path d="M300 72V23" stroke="#25272a" stroke-width="9"/>` + rect(47,74,506,221,9,'#d3d1c7','#42464c',3) + rect(62,91,476,184,3,'#292c2e','#8e8e87',2) +
    [101,125,149].map(y=>rect(219,y,145,18,5,'#a5a8a3','none',0)).join('') + rect(219,183,145,61,5,'#c9c9bd','none',0) +
    text(261,199,'SELECT',11,'#9f3033') + text(324,199,'START',11,'#9f3033') + rect(239,209,44,16,8,'#232628') + rect(302,209,44,16,8,'#232628') +
    rect(381,184,54,55,2,'#d7d5cb','none',0) + rect(455,184,54,55,2,'#d7d5cb','none',0) + roundButton(408,211,21,'#b7252a','') + roundButton(482,211,21,'#b7252a','') + text(431,258,'B',15,'#cc3736') + text(505,258,'A',15,'#cc3736') + p.body };
}
function snes() {
  const p = dpad(149,184,1.05);
  const controls = { ...p.controls, 2:footprint(269,200,31,15), 3:footprint(322,200,31,15), 9:footprint(456,146,34), 1:footprint(417,184,34), 8:footprint(495,184,34), 0:footprint(456,222,34), 10:footprint(142,79,93,12), 11:footprint(456,79,93,12) };
  return { name:'Super NES · European / Japanese four-colour controller', controls, body:
    `<path d="M300 90V23" stroke="#34363b" stroke-width="7"/>
    <path d="M88 101Q104 68 148 72L197 78V95ZM402 95V78L451 72Q496 68 513 101Z" fill="#aaa9a9" stroke="#696a6a" stroke-width=".8"/>
    <path d="M145 81C82 80 43 123 43 183C43 248 82 292 143 292C180 292 212 262 243 258H357C388 262 420 292 457 292C518 292 557 248 557 183C557 123 518 80 455 81Z" fill="#99999b" stroke="#65666a" stroke-width=".9"/>
    <path d="M145 79C84 78 46 121 46 179C46 240 83 284 143 284C180 284 212 254 243 250H357C388 254 420 284 457 284C517 284 554 240 554 179C554 121 516 78 455 79Z" fill="#c9c8c7" stroke="#e0dfdc" stroke-width=".65"/>
    <path d="M148 87C90 86 54 125 54 180C54 235 87 275 143 276" fill="none" stroke="#eeeae2" stroke-opacity=".4" stroke-width=".7"/>` +
    circle(456,184,79,'#a1a0a2','#88888d',.7) + circle(456,184,77.5,'#adacaf','#c0bfc1',.65) + circle(149,184,46,'#b5b4b5','#c3c2c1',.7) + p.body +
    `<g transform="rotate(-29 269 200)">${rect(253,192,32,16,8,'#8b8b8d','#aaa9ab',.6)}${rect(254,193,30,13,6.5,'#515156','#33343a',.6)}</g><g transform="rotate(-29 322 200)">${rect(306,192,32,16,8,'#8b8b8d','#aaa9ab',.6)}${rect(307,193,30,13,6.5,'#515156','#33343a',.6)}</g>` + text(263,224,'SELECT',8) + text(321,224,'START',8) +
    roundButton(456,146,17,'#285999','') + roundButton(417,184,17,'#348547','') + roundButton(495,184,17,'#b83336','') + roundButton(456,222,17,'#ceaa30','') +
    text(456,120,'X',9,'#424247') + text(390,187,'Y',9,'#424247') + text(522,187,'A',9,'#424247') + text(456,250,'B',9,'#424247') };
}
function gb() {
  const p=dpad(247,210,.65);
  return { name:'Game Boy · original DMG handheld', controls:{ ...p.controls,8:footprint(355,201,21),0:footprint(326,215,21),2:footprint(279,264,23,10),3:footprint(316,264,23,10) }, body:
    `<path d="M219 19H377Q387 19 387 30V276Q387 319 346 319H221Q212 319 212 310V30Q212 19 219 19Z" fill="#d2d0c6" stroke="#464b55" stroke-width="2.5"/>` +
    `<path d="M213 38H386M222 20V36M378 20V36" stroke="#aeaea7" stroke-width="2"/>` +
    `<path d="M231 54H367V137Q367 157 348 157H231Z" fill="#696c78" stroke="#545865" stroke-width="1.5"/>` + rect(254,65,88,78,1,'#899369','#4b5244',2) + circle(239,84,3,'#983349','none') + text(239,97,'BAT',5,'#dad6d3') + `<path d="M237 60H362" stroke="#9e5977" stroke-width="2"/>` +
    p.body + `<g transform="rotate(-26 340 208)">${rect(307,193,66,29,14,'#b9b8b3','none',0)}</g>` + roundButton(355,201,10.5,'#8d234e','') + roundButton(326,215,10.5,'#8d234e','') + text(365,224,'A',8,'#34466f') + text(335,239,'B',8,'#34466f') +
    `<g transform="rotate(-25 279 264)">${rect(267,260,24,8,4,'#75777a','none',0)}${text(278,279,'SELECT',6,'#34466f')}</g><g transform="rotate(-25 316 264)">${rect(304,260,24,8,4,'#75777a','none',0)}${text(315,279,'START',6,'#34466f')}</g>` +
    [0,1,2,3,4,5].map(i=>`<path d="M${333+i*7} ${288-i*3}l8 17" stroke="#8f9290" stroke-width="3" stroke-linecap="round"/>`).join('') };
}
function gba() {
  const p=dpad(108,149,1.05);
  return { name:'Game Boy Advance · original AGB handheld', controls:{...p.controls,8:footprint(504,138,34),0:footprint(459,159,34),2:footprint(134,245,20,12),3:footprint(134,219,20,12),10:footprint(115,58,117,20),11:footprint(485,58,117,20)},body:
    rect(57,51,117,28,12,'#b6b9c5') + rect(426,51,117,28,12,'#b6b9c5') +
    `<path d="M161 49Q300 34 439 49C491 50 530 59 548 93C571 136 566 194 541 246Q527 279 491 286Q300 311 109 286Q73 279 59 246C34 194 29 136 52 93C70 59 109 50 161 49Z" fill="#706a9f" stroke="#35384e" stroke-width="3"/>` +
    `<path d="M68 95Q88 63 159 65Q300 50 438 65" fill="none" stroke="#9994c0" stroke-width="3"/>` + rect(170,75,260,200,20,'#242a32','#49485b',3) + rect(189,94,222,148,2,'#657877','#121b22',3) + text(300,261,'32-BIT HANDHELD',9,'#afb2bd') +
    p.body + roundButton(504,138,17,'#b0b1c0','A','#474957') + roundButton(459,159,17,'#b0b1c0','B','#474957') +
    rect(123,213,22,12,6,'#aeb0bb') + rect(123,239,22,12,6,'#aeb0bb') + text(106,221,'START',7,'#e8e6f3') + text(103,248,'SELECT',7,'#e8e6f3') + text(115,64,'L',10) + text(485,64,'R',10) + circle(501,97,4,'#8cb965','#385244',1) +
    [0,1,2,3,4].map(i=>`<path d="M${455+i*6} 210l24 -8" stroke="#39374f" stroke-width="3.5" stroke-linecap="round" transform="translate(0 ${i*8})"/>`).join('') };
}
function n64() {
  const p=dpad(205,116,.73);
  const controls={...p.controls,10:footprint(209,51,64,13),11:footprint(395,51,64,13),3:footprint(300,124,22),0:footprint(381,145,24),1:footprint(360,124,24),23:footprint(404,85,18),22:footprint(404,120,18),21:footprint(386,102,18),20:footprint(422,102,18),19:footprint(300,166,16,13),18:footprint(300,202,16,13),17:footprint(282,184,13,16),16:footprint(318,184,13,16),12:footprint(507,291,44,23)};
  return { name:'Nintendo 64 · original three-grip controller',controls,body:
    `<path d="M300 26V7" stroke="#33373c" stroke-width="6"/>` + rect(177,44,64,16,7,'#9197a0') + rect(363,44,64,16,7,'#9197a0') +
    `<path d="M245 27Q300 8 355 27L362 44Q410 50 428 63Q448 80 447 122C459 162 454 232 441 249Q429 268 416 250L396 180Q393 172 384 173L361 175Q344 179 341 196L327 284Q321 320 300 322Q279 320 272 284L258 196Q255 179 240 175L217 173Q207 172 204 180L184 250Q172 267 160 249C146 230 142 163 153 122Q152 80 172 63Q190 50 237 44Z" fill="#bfc1c5" stroke="#424750" stroke-width="2.5"/>` +
    `<path d="M162 131Q168 159 211 165L247 170M439 131Q432 159 389 165L353 170M244 30L253 69M356 30L348 69" fill="none" stroke="#a4a8ae" stroke-width="2"/>` + circle(205,116,32,'#b4b8bd','none',0) + p.body + text(209,54,'L',8) + text(395,54,'R',8) +
    roundButton(300,124,11,'#c73d43','') + text(300,143,'START',7) + roundButton(381,145,12,'#235eaa','A') + roundButton(360,124,12,'#32944d','B') +
    circle(404,102,24,'none','#9fa4ab',1) + roundButton(404,85,9,'#e1ba3f','▲','#665824') + roundButton(404,120,9,'#e1ba3f','▼','#665824') + roundButton(386,102,9,'#e1ba3f','◀','#665824') + roundButton(422,102,9,'#e1ba3f','▶','#665824') + text(404,106,'C',8,'#777b80') +
    circle(300,184,32,'#797e85','#575d66',1.5) + `<path d="M290 162H311L322 173V195L311 206H290L278 195V173Z" fill="#3f454d" stroke="#5e646d" stroke-width="2"/>` + circle(300,183,14,'#d1d3d5','#989fa7',1.5) + circle(300,183,10,'none','#b6bcc3',1) + circle(300,183,6,'none','#b6bcc3',1) + circle(300,183,1.5,'#6e747c','none',0) +
    rect(451,258,111,64,8,'#202939','#62728a',1) + text(507,274,'UNDERSIDE',8,'#bbc9d9') + rect(485,280,44,23,8,'#969da8','#dadee6',1) + text(507,296,'Z',12,'#202938') + `<path d="M450 289H338" stroke="#8393a9" stroke-dasharray="3 4"/>` };
}
function virtualboy() {
  const l=dpad(175,91,.87),r=dpad(425,91,.87,[19,18,17,16]);
  return { name:'Virtual Boy · original twin-D-pad controller', controls:{...l.controls,...r.controls,8:footprint(377,112,25),0:footprint(347,128,25),2:footprint(223,113,24),3:footprint(253,129,24),10:footprint(275,303,37,20),11:footprint(328,303,37,20)}, body:
    `<path d="M300 61V16" stroke="#20252c" stroke-width="7"/>` +
    `<path d="M124 106C108 134 108 180 98 223Q79 289 96 312Q111 330 132 314Q142 305 146 274L155 209Q160 168 190 162H222V213H378V162Q409 159 426 176L441 209L450 274Q454 305 464 314Q485 330 501 312Q516 289 498 223C488 180 489 134 473 106Z" fill="#252b30" stroke="#0e141b" stroke-width="3"/>` +
    `<path d="M136 264Q131 302 121 307M462 264Q467 302 478 307" fill="none" stroke="#414951" stroke-width="4"/>` + rect(227,128,146,83,3,'#323b42','#1b232b',2) + text(300,181,'STEREO CONTROLLER',10,'#9ca6ae') +
    `<path d="M132 44Q162 18 197 44L271 99Q301 124 277 156Q264 174 230 165L154 145Q110 132 119 87Q121 60 132 44Z" fill="#313940" stroke="#151d25" stroke-width="2"/><path d="M468 44Q438 18 403 44L329 99Q299 124 323 156Q336 174 370 165L446 145Q490 132 481 87Q479 60 468 44Z" fill="#313940" stroke="#151d25" stroke-width="2"/>` +
    l.body+r.body+roundButton(223,113,12,'#a1a8af','')+roundButton(253,129,12,'#a1a8af','')+roundButton(377,112,12.5,'#c82336','')+roundButton(347,128,12.5,'#c82336','')+text(225,94,'SELECT',8,'#adb6bf')+text(261,111,'START',8,'#adb6bf')+text(375,94,'A',10,'#bac2ca')+text(343,110,'B',10,'#bac2ca')+
    rect(286,69,29,10,3,'#8a929b') + `<path d="M297 70V77M301 70V77M305 70V77" stroke="#bdc3c9" stroke-width="2"/>` +
    rect(235,269,132,60,7,'#202939','#62728a',1) + text(301,284,'REAR TRIGGERS',8,'#bbc9d9') + rect(257,294,37,20,7,'#8b949f') + rect(310,294,37,20,7,'#8b949f') + text(275,308,'L',10,'#202938') + text(328,308,'R',10,'#202938') };
}
const builders={nes,snes,n64,gb,gba,virtualboy};
export function getNintendoArt(layout) {
  const id=typeof layout === 'string' ? layout : layout?.systemId;
  if(id==='n64')return getLayeredN64Art();
  const art=builders[id]?.() ?? null;
  if(id==='gb' && art){
    // Original DMG shell is 90 mm wide by 148 mm tall.
    const scale=(300*90/148)/175;
    art.body=`<g transform="translate(300 0) scale(${scale} 1) translate(-300 0)">${art.body}</g>`;
    for(const control of Object.values(art.controls)){control.x=300+(control.x-300)*scale;control.width*=scale;}
  }
  return art;
}
