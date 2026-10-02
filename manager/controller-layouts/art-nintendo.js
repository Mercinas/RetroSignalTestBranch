// Original hardware-inspired, unbranded vector drawings. Coordinates are not CAD dimensions.
// See docs/controller-references-nintendo.md. Physical footprints stay separate from hit targets.
const text = (x, y, value, size = 10, fill = '#343945') => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" font-weight="700" fill="${fill}">${value}</text>`;
const rect = (x, y, w, h, r, fill, stroke = '#343945', sw = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const circle = (x, y, r, fill, stroke = '#343945', sw = 2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const footprint = (x, y, width, height = width) => ({ x, y, width, height });
function roundButton(x, y, r, fill, label, labelFill = '#f4f5fa') {
  return circle(x, y, r + 3, '#777b85', '#555963', 1) + circle(x, y, r, fill, '#353843', 1.5) + `<path d="M${x-r*.55} ${y-r*.5} Q${x} ${y-r*.85} ${x+r*.55} ${y-r*.5}" fill="none" stroke="#ffffff" stroke-opacity=".25" stroke-width="2"/>` + (label ? text(x, y + 4, label, Math.max(9, r * .7), labelFill) : '');
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
  const p = dpad(149,177,1.15);
  const controls = { ...p.controls, 2:footprint(269,192,31,15), 3:footprint(322,192,31,15), 9:footprint(456,135,34), 1:footprint(414,174,34), 8:footprint(496,174,34), 0:footprint(456,212,34), 10:footprint(136,75,102,23), 11:footprint(462,75,102,23) };
  return { name:'Super NES · European / Japanese four-colour controller', controls, body:
    `<path d="M300 86V23" stroke="#34363b" stroke-width="8"/>` + rect(87,67,102,31,15,'#a4a4a7') + rect(410,67,102,31,15,'#a4a4a7') +
    `<path d="M143 84C79 82 42 118 42 176C42 242 78 277 140 277C177 277 210 252 240 246H361C391 252 420 277 456 277C519 277 557 241 557 178C557 119 522 84 457 84Z" fill="#cccbcb" stroke="#41454c" stroke-width="3"/>` +
    `<path d="M150 99C97 99 60 130 60 176C60 224 92 256 139 258" fill="none" stroke="#eeeded" stroke-width="4"/>` + circle(456,174,79,'#b7b6b8','#aaa9ac',2) + p.body +
    `<g transform="rotate(-29 269 192)">${rect(254,185,30,14,7,'#4f5157')}</g><g transform="rotate(-29 322 192)">${rect(307,185,30,14,7,'#4f5157')}</g>` + text(263,218,'SELECT',9) + text(321,218,'START',9) + text(136,81,'L',11) + text(462,81,'R',11) +
    roundButton(456,135,17,'#2b5da1','X') + roundButton(414,174,17,'#3d8c4f','Y') + roundButton(496,174,17,'#c0383d','A') + roundButton(456,212,17,'#d8aa31','B','#433d2d') };
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
  return builders[typeof layout === 'string' ? layout : layout?.systemId]?.() ?? null;
}
