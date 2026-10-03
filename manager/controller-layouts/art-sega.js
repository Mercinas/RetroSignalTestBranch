// Original, unbranded vector drawings. Hardware photo references and model
// choices: docs/controller-references-sega.md. All dimensions are SVG units.
const label = (x, y, text, size = 11, color = '#e2e5e6') => `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="${size}" font-weight="600" fill="${color}">${text}</text>`;
const round = (x, y, r, text, color = '#292c30') => `<circle cx="${x}" cy="${y + 2}" r="${r + 3}" fill="#0b0d10"/><circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="#777d84" stroke-width="1.3"/><path d="M${x-r*.65} ${y-r*.55} Q${x} ${y-r*1.04} ${x+r*.65} ${y-r*.55}" fill="none" stroke="#a3a9b0" opacity=".42"/>${label(x, y + 1, text, r > 19 ? 14 : 12)}`;
const pill = (x, y, w, h, text, color = '#777d86') => `<rect x="${x-w/2-3}" y="${y-h/2-2}" width="${w+6}" height="${h+6}" rx="${h/2}" fill="#101216"/><rect x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" rx="${h/2}" fill="${color}" stroke="#a1a5aa"/>${label(x, y + h/2 + 13, text, 10)}`;
const footprint = (x, y, width, height = width) => ({ x, y, width, height });
function directional(x, y, radius = 48, square = false) {
  const a = radius * .36, b = radius * .81;
  return `${square ? `<rect x="${x-radius}" y="${y-radius}" width="${2*radius}" height="${2*radius}" rx="${radius*.36}" fill="#16191d" stroke="#757b83" stroke-width="2"/>` : `<circle cx="${x}" cy="${y}" r="${radius+6}" fill="#080a0c" stroke="#565d65" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${radius}" fill="#24282d" stroke="#737980"/>`}
    <path d="M${x-a} ${y-b} H${x+a} V${y-a} H${x+b} V${y+a} H${x+a} V${y+b} H${x-a} V${y+a} H${x-b} V${y-a} H${x-a}Z" fill="#373c43" stroke="#111317" stroke-width="2"/>
    <circle cx="${x}" cy="${y}" r="${radius*.19}" fill="#292d33"/>
    ${[[0,-1],[0,1],[-1,0],[1,0]].map(([dx,dy])=>`<path d="M-3 2 L0 -3 L3 2" transform="translate(${x+dx*radius*.67} ${y+dy*radius*.67}) rotate(${dx ? dx*90 : dy===1 ? 180 : 0})" fill="none" stroke="#b9bfc6" stroke-width="1.4"/>`).join('')}`;
}
function directions(x, y, offset = 31, size = 23) {
  return {4:footprint(x,y-offset,size),5:footprint(x,y+offset,size),6:footprint(x-offset,y,size),7:footprint(x+offset,y,size)};
}
const edgeCallout = (x, y, w, text, caption = 'TOP EDGE') => `<rect x="${x-w/2-10}" y="${y-18}" width="${w+20}" height="51" rx="7" fill="#171d25" stroke="#697483" stroke-dasharray="3 3"/><rect x="${x-w/2}" y="${y-9}" width="${w}" height="18" rx="6" fill="#575e68" stroke="#adb5bf"/>${label(x,y,text,10)}${label(x,y+23,caption,8,'#b6c2d0')}`;
function masterSystem() {
  return { name:'Master System original Control Pad (flat D-pad)', controls:{...directions(170,182,30,24),0:footprint(389,199,46),8:footprint(473,199,46),2:footprint(465,58,48,18)}, body:`
    ${edgeCallout(465,58,48,'PAUSE','ON CONSOLE')}
    <path d="M538 162 H561" stroke="#101216" stroke-width="10"/>
    <rect x="60" y="115" width="480" height="153" rx="8" fill="#111419" stroke="#717981" stroke-width="2"/>
    <rect x="64" y="113" width="470" height="144" rx="5" fill="#292d32" stroke="#5b626b"/>
    <path d="M78 125 H265 V157 H519 V245 H78Z" fill="#101317" stroke="#6c737b"/>
    <rect x="91" y="122" width="158" height="123" rx="5" fill="#20262e" stroke="#b74240" stroke-width="2"/>
    <path d="M100 130 L144 155 H195 L239 130 M100 237 L144 210 H195 L239 237" fill="none" stroke="#8c949f" stroke-width="3"/>
    ${directional(170,182,45,true)}
    ${Array.from({length:12},(_,i)=>`<path d="M${281+i*5} 164 V233" stroke="#69707a" stroke-width="1"/>`).join('')}
    <rect x="354" y="166" width="70" height="69" fill="#5b626b"/><rect x="438" y="166" width="70" height="69" fill="#5b626b"/>
    <rect x="354" y="151" width="70" height="12" fill="#bd3d36"/><rect x="438" y="151" width="70" height="12" fill="#bd3d36"/>
    ${label(389,157,'1 / START',8)}${label(473,157,'2',9)}${round(389,199,23,'1')}${round(473,199,23,'2')}` };
}
function megaDrive(three) {
  const controls = {...directions(159,170,32,25),3:footprint(three ? 345 : 289,three ? 125 : 163,43,17),1:footprint(372,210,45),0:footprint(427,191,45),8:footprint(481,178,45)};
  if(!three) Object.assign(controls,{10:footprint(369,153,34),9:footprint(419,132,34),11:footprint(470,127,34),2:footprint(492,45,44,18)});
  const shell = three ? 'M58 211 C43 166 69 112 125 84 C207 43 377 48 457 88 C515 116 548 167 544 220 C542 263 505 303 466 299 C435 296 431 257 401 240 C341 207 250 207 209 242 C182 265 175 292 137 292 C95 292 66 257 58 211Z' : 'M62 214 C48 168 82 113 138 85 C196 53 227 63 273 77 C302 86 327 82 358 74 C406 59 450 75 487 103 C533 138 551 193 535 244 C522 286 483 309 451 293 C431 282 416 259 391 246 C333 217 264 215 211 244 C177 263 150 289 113 275 C86 265 68 242 62 214Z';
  return {name:three ? 'Genesis / Mega Drive original three-button Control Pad' : 'Genesis / Mega Drive original six-button Arcade Pad',controls,body:`
    <path d="M302 79 V29" stroke="#11151a" stroke-width="10"/><path d="M297 42 H307 M297 48 H307 M297 54 H307 M297 60 H307" stroke="#69717c" stroke-width="2"/>
    ${!three ? edgeCallout(492,45,44,'MODE') : ''}
    <path d="${shell}" transform="translate(0 5)" fill="#0b0d11" stroke="#555d68" stroke-width="2"/><path d="${shell}" fill="#30353d" stroke="#727b87" stroke-width="2"/>
    <ellipse cx="159" cy="170" rx="72" ry="76" fill="#15191e" stroke="#626b77" stroke-width="2"/>
    ${directional(159,170,49)}
    ${three ? '<path d="M331 213 C329 173 408 129 482 138 C513 142 522 188 502 203 C463 214 401 236 357 241 C340 240 333 229 331 213Z" fill="#15191e" stroke="#59616d"/>' : '<ellipse cx="423" cy="184" rx="101" ry="88" fill="#15191e" stroke="#626b77" stroke-width="2"/>'}
    ${pill(three ? 345 : 289,three ? 125 : 163,43,17,'START')}
    ${round(372,210,22.5,'A')}${round(427,191,22.5,'B')}${round(481,178,22.5,'C')}
    ${!three ? `${round(369,153,17,'X','#737984')}${round(419,132,17,'Y','#737984')}${round(470,127,17,'Z','#737984')}` : ''}`};
}
function saturn(analog) {
  if(analog) return {name:'Saturn 3D Control Pad (analog device required)',controls:{...directions(218,211,20,18),19:footprint(213,100,19),18:footprint(213,138,19),17:footprint(194,119,19),16:footprint(232,119,19),3:footprint(287,262,29,29),1:footprint(337,212,29),0:footprint(375,198,29),8:footprint(413,186,29),9:footprint(335,166,27),10:footprint(371,153,27),11:footprint(407,141,27),12:footprint(95,65,50,18),13:footprint(505,65,50,18)},body:`
    ${edgeCallout(95,65,50,'L')}${edgeCallout(505,65,50,'R')}
    <path d="M300 37V13" stroke="#171b20" stroke-width="9"/>
    <path d="M155 186Q155 59 258 37Q300 24 346 37Q449 59 451 186L438 309Q423 326 393 315L377 283H228L212 315Q182 326 167 309Z" fill="#191e24" stroke="#10151b" stroke-width="2"/>
    <path d="M155 180C153 96 214 33 300 33C386 33 447 96 447 180C447 257 389 301 300 305C211 301 155 257 155 180Z" fill="#30363e" stroke="#747b85" stroke-width="2"/>
    <path d="M166 171C166 94 223 43 300 43C355 43 404 68 425 110" fill="none" stroke="#747c85" stroke-opacity=".6" stroke-width="2"/>
    <circle cx="213" cy="119" r="44" fill="#10151b" stroke="#6b7480"/><circle cx="213" cy="119" r="35" fill="#222831" stroke="#0c1116"/><circle cx="213" cy="119" r="25" fill="#4a515c" stroke="#818894"/>
    <circle cx="213" cy="119" r="19" fill="none" stroke="#222933"/><circle cx="213" cy="119" r="12" fill="none" stroke="#222933"/>
    ${directional(218,211,32)}${round(287,262,14.5,'')}${label(287,242,'START',7)}
    ${round(337,212,14.5,'A')}${round(375,198,14.5,'B')}${round(413,186,14.5,'C')}${round(335,166,13.5,'X')}${round(371,153,13.5,'Y')}${round(407,141,13.5,'Z')}
    <rect x="269" y="285" width="38" height="12" rx="6" fill="#11161d" stroke="#59636e"/><rect x="279" y="285" width="15" height="12" rx="5" fill="#646d77"/>
    ${label(305,85,'3D CONTROL PAD',8,'#abb2bc')}`};
  return {name:'Saturn original Control Pad — North American Model 2',controls:{...directions(155,172,31,24),3:footprint(280,219,39,19),1:footprint(369,223,45),0:footprint(426,203,45),8:footprint(482,185,45),9:footprint(362,159,34),10:footprint(415,140,34),11:footprint(465,128,34),12:footprint(145,39,51,18),13:footprint(452,39,51,18)},body:`
    ${edgeCallout(145,39,51,'L')}${edgeCallout(452,39,51,'R')}
    <path d="M300 91 V28" stroke="#14171c" stroke-width="10"/>
    <path d="M62 218 C78 145 104 96 151 84 C189 74 214 101 267 102 C319 105 349 84 403 84 C456 84 494 111 514 161 C535 211 546 279 503 305 C467 326 430 284 390 259 C346 231 283 226 236 244 C194 259 158 288 113 280 C74 273 55 252 62 218Z" fill="#30353d" stroke="#78828d" stroke-width="2"/>
    <path d="M83 206 C105 130 125 105 169 107 C210 108 241 125 287 122 C350 116 402 95 452 128 C486 151 516 243 491 271 C471 296 421 243 385 226 C320 198 268 214 229 228 C180 248 146 274 111 254 C91 243 79 227 83 206Z" fill="#191d24" stroke="#56616f"/>
    ${directional(155,172,49)}${pill(280,219,39,19,'START','#4f5762')}
    ${round(369,223,22.5,'A','#6a707a')}${round(426,203,22.5,'B','#6a707a')}${round(482,185,22.5,'C','#6a707a')}${round(362,159,17,'X')}${round(415,140,17,'Y')}${round(465,128,17,'Z')}`};
}
function gameGear() {
  return {name:'Game Gear original black handheld',controls:{...directions(113,152,24,20),0:footprint(471,204,35),8:footprint(511,172,35),3:footprint(469,109,24,37)},body:`
    <path d="M70 40 Q299 27 530 40 Q551 40 555 66 L560 258 Q559 297 524 304 Q300 318 74 304 Q43 299 40 265 L45 67 Q47 43 70 40Z" fill="#292e35" stroke="#7c838b" stroke-width="2"/>
    <path d="M144 44 Q300 33 455 44 L434 217 Q431 254 399 264 H203 Q169 258 164 225Z" fill="#11161c" stroke="#67717c" stroke-width="2"/>
    <rect x="195" y="68" width="214" height="170" rx="6" fill="#535b65" stroke="#838c97" stroke-width="2"/><rect x="209" y="82" width="186" height="143" rx="2" fill="#242f3a" stroke="#171e28" stroke-width="3"/><path d="M214 87H389L214 216Z" fill="#738291" opacity=".08"/>
    ${directional(113,152,36)}
    <circle cx="184" cy="104" r="4" fill="#b63b41"/>${label(183,121,'POWER',7)}
    <path d="M464 90 Q486 100 478 120 Q473 129 458 125Z" fill="#376dc2" stroke="#85a9e1"/>
    ${label(505,104,'START',8)}${round(471,204,17.5,'1')}${round(511,172,17.5,'2')}
    <path d="M460 182 L494 153" stroke="#9fa7b1" stroke-width="1.5"/>
    ${Array.from({length:7},(_,r)=>Array.from({length:7},(_,c)=> (r-3)**2+(c-3)**2<13?`<circle cx="${90+c*7}" cy="${237+r*7}" r="2.1" fill="#0c1015"/>`:'').join('')).join('')}
    <path d="M54 58 V259 Q56 284 76 289 M546 61 V256 Q544 285 523 290" fill="none" stroke="#464f5a" stroke-width="2"/>`};
}
export function getSegaArt(layout) {
  if (layout.systemId === 'mastersystem') return masterSystem();
  if (['genesis','segacd','sega32x'].includes(layout.systemId)) return megaDrive(layout.variant?.id === 'three-button');
  if (layout.systemId === 'saturn') return saturn(layout.variant?.id === 'analog');
  if (layout.systemId === 'gamegear') return gameGear();
  return null;
}
