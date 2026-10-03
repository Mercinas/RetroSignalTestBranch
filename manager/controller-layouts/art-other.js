// Original SVG illustrations, informed by original hardware photographs/manuals.
// Coordinates refer to a front/top orthographic view, not a perspective photograph.
// Small physical buttons are kept separate from the renderer's larger hit areas.
const ink = "#17191c";
const text = (x,y,label,size=10,color="#c5c6c7") => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" fill="${color}">${label}</text>`;
const rect = (x,y,w,h,r=4,fill=ink,stroke="#55585c") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
const circle = (x,y,r,fill=ink,stroke="#55585c") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
const path = (d,fill=ink,stroke="#55585c") => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
const region = (x,y,width=26,height=width) => ({x,y,width,height});
const directions = (x,y,gap=23,size=23) => ({4:region(x,y-gap,size),5:region(x,y+gap,size),6:region(x-gap,y,size),7:region(x+gap,y,size)});
const cross = (x,y,size=70) => { const a=size/2,b=size/6; return path(`M${x-b} ${y-a}H${x+b}V${y-b}H${x+a}V${y+b}H${x+b}V${y+a}H${x-b}V${y+b}H${x-a}V${y-b}H${x-b}Z`,"#222529","#08090b")+circle(x,y,b*.58,"#272a2e","#36393d"); };
const button = (x,y,label,r=17,fill="#34373c",labelColor="#eee") => circle(x,y+1,r+2,"#16191e","#636973")+circle(x,y,r,fill,"#101216")+`<path d="M${x-r*.65} ${y-r*.5}Q${x} ${y-r*.95} ${x+r*.65} ${y-r*.5}" fill="none" stroke="#ffffff" stroke-opacity=".2" stroke-width="1.2"/>`+text(x,y+4,label,12,labelColor);
const cable = (x,y) => path(`M${x} ${y}V20`,"none","#23262a");
const keypad = (x,y,w=30,h=18,gap=7) => Array.from({length:12},(_,i)=>{const cx=x+(i%3)*(w+gap),cy=y+Math.floor(i/3)*(h+gap);return rect(cx,cy,w,h,3,"#45464b","#202226")+text(cx+w/2,cy+h*.73,["1","2","3","4","5","6","7","8","9","*","0","#"][i],10);}).join("");
const switchPanel = (labels,x=395,y=105,w=155) => rect(x,y,w,labels.length*46+34,9,"#24292f","#555f6a")+text(x+w/2,y+19,"CONSOLE SWITCHES",10)+labels.map(([label,cy])=>rect(x+14,cy-10,23,20,3,"#838a8f","#111")+rect(x+20,cy-6,11,12,2,"#c3c6c6","#ddd")+text(x+95,cy+4,label,11)).join("");

function cx40(){
  const controls={...directions(253,180,25,26),0:region(142,132,35),2:region(420,159,26,22),3:region(420,205,26,22)};
  const body=cable(251,86)+rect(89,84,270,217,20,"#242428","#08090b")+rect(100,94,248,194,11,"#303035","#4c4b4e")+
    `<path d="M105 267H343M105 275H343M105 283H343" fill="none" stroke="#151519" stroke-width="3"/>`+
    circle(253,181,72,"#222226","#111114")+circle(253,181,60,"#36363b","#131316")+circle(253,181,46,"#1d1d21","#56555a")+
    `<path d="M253 224V159" stroke="#121215" stroke-width="35" stroke-linecap="round"/>`+circle(253,153,30,"#28282d","#08080b")+
    circle(142,132,22,"#151518","#08090a")+button(142,132,"",17,"#c63822")+text(166,259,"TOP",10,"#c68739")+
    switchPanel([["SELECT",159],["RESET",205]])+text(251,322,"CX40 joystick · top view",12);
  return {name:"Atari CX40 joystick",body,controls};
}
function cx24(){
  const controls={...directions(256,150,23,24),0:region(201,212,19,72),8:region(312,212,19,72),2:region(420,140,26,22),3:region(420,186,26,22),9:region(420,232,26,22)};
  const body=cable(256,63)+path("M219 62Q256 45 293 62L317 113V253Q314 287 285 297H227Q198 288 195 253V113Z","#242429","#090a0d")+
    path("M218 80Q256 65 294 80L301 125V263Q256 287 211 263V125Z","#37383e","#58595e")+
    rect(193,176,17,71,7,"#c42a24","#7b1716")+rect(303,176,17,71,7,"#c42a24","#7b1716")+
    circle(256,156,43,"#17181b","#747478")+circle(256,153,29,"#222328","#08090a")+rect(241,94,30,71,13,"#232429","#08090a")+circle(256,100,21,"#33353a","#08090a")+
    text(256,258,"PRO-LINE",12)+switchPanel([["SELECT",140],["PAUSE",186],["RESET",232]],395,86)+text(255,322,"CX24 Pro-Line · side fire buttons",12);
  return {name:"Atari CX24 Pro-Line joystick",body,controls};
}
function cx52(){
  const controls={...directions(300,110,22,23),8:region(224,146,17,39),0:region(224,197,17,39),3:region(260,175,29,16)};
  controls[8].aliases=[region(376,146,17,39)];
  controls[0].aliases=[region(376,197,17,39)];
  const body=cable(300,36)+path("M251 35Q300 25 349 35L373 89L363 279Q361 308 335 315H265Q239 308 237 279L227 89Z","#232529","#08090b")+
    path("M249 48H351L359 286Q300 304 241 286Z","#36383e","#585a60")+
    rect(216,127,15,39,4,"#bb3632","#591817")+rect(216,178,15,39,4,"#bb3632","#591817")+rect(369,127,15,39,4,"#bb3632","#591817")+rect(369,178,15,39,4,"#bb3632","#591817")+
    circle(300,114,44,"#23252a","#797b7d")+circle(300,114,33,"#101215","#43454a")+rect(290,69,20,58,9,"#393b40","#101216")+circle(300,76,18,"#34363c","#090a0c")+
    [[260,"START","#387e42"],[300,"PAUSE","#c9a544"],[340,"RESET","#b3413d"]].map(([x,l,c])=>rect(x-15,167,30,16,3,c,"#17191b")+text(x,196,l,7)).join("")+keypad(249,206,28,17,9)+
    text(147,137,"FIRE 1",11)+text(147,188,"FIRE 2",11)+path("M177 133H213M177 184H213","none","#9099a2")+text(465,151,"Matching buttons",11)+text(465,168,"on either side",11);
  return {name:"Atari 5200 CX52 controller",body,controls};
}
function turbo(){
  const controls={...directions(145,191,24,25),2:region(268,213,33,12),3:region(317,213,33,12),0:region(411,210,38),8:region(480,210,38)};
  const body=cable(300,86)+rect(65,84,470,202,16,"#222329","#08090c")+rect(78,97,444,174,9,"#33343b","#5a5b61")+
    path("M79 125H521V140H79Z","#292a2f","none")+text(219,124,"TURBO PAD",17,"#e95c34")+
    circle(145,191,53,"#22232a","#0b0c11")+cross(145,191,79)+
    rect(251,207,34,12,6,"#73747a","#111216")+rect(300,207,34,12,6,"#73747a","#111216")+text(268,237,"SELECT",9)+text(317,237,"RUN",9)+
    [[411,"II"],[480,"I"]].map(([x,label])=>text(x,164,"TURBO",9)+rect(x-21,172,42,9,4,"#121318","#575861")+rect(x-5,170,13,13,2,"#7b7b82","#17181c")+button(x,210,label,21,"#272830")+text(x,249,label,12)).join("");
  return {name:"NEC TurboGrafx-16 TurboPad",body,controls};
}
function jaguar(){
  const controls={...directions(165,132,22,23),8:region(401,158,33),0:region(442,132,33),1:region(481,103,33),2:region(275,131,27,11),3:region(322,131,27,11)};
  const body=cable(300,55)+path("M124 67Q165 38 222 63Q300 80 378 63Q448 38 491 80Q521 125 502 172L459 246Q445 265 421 251L378 220L365 299Q361 316 342 316H258Q239 316 235 299L222 220L179 251Q155 265 141 246L98 172Q79 113 124 67Z","#303136","#101114")+
    path("M240 171Q300 154 360 171L349 299H251Z","#202126","#53555a")+rect(249,183,102,113,5,"#292a31","#101115")+keypad(255,190,26,19,6)+
    circle(165,132,47,"#232429","#101115")+cross(165,132,65)+button(401,158,"A",17,"#ac232c")+button(442,132,"B",17,"#ac232c")+button(481,103,"C",17,"#ac232c")+
    rect(261,126,28,10,4,"#5a5a61","#151519")+rect(308,126,28,10,4,"#5a5a61","#151519")+text(275,117,"PAUSE",8)+text(322,117,"OPTION",8);
  return {name:"Atari Jaguar original three-button PowerPad",body,controls};
}
function playstation(analog){
  const controls={...directions(147,142,28,26),0:region(454,183,34),8:region(492,145,34),1:region(416,145,34),9:region(454,107,34),2:region(273,153,29,12),3:region(327,153,26,22),10:region(145,63,63,18),11:region(455,63,63,18),12:region(145,31,59,16),13:region(455,31,59,16)};
  const shell=analog
    ? "M111 70Q79 82 73 132L48 251Q40 282 66 299Q94 314 114 285L170 220Q185 208 190 226Q204 268 246 259L276 242H324L354 259Q396 268 410 226Q415 208 430 220L486 285Q506 314 534 299Q560 282 552 251L527 132Q521 82 489 70Q451 55 415 76H185Q149 55 111 70Z"
    : "M111 70Q79 82 73 132L51 260Q48 283 70 292Q93 302 109 280L168 213Q180 202 202 208L241 220H359L398 208Q420 202 432 213L491 280Q507 302 530 292Q552 283 549 260L527 132Q521 82 489 70Q451 55 415 76H185Q149 55 111 70Z";
  let body=rect(114,22,62,18,6,"#85858c","#4c4d53")+text(145,35,"L2",10,"#202128")+rect(424,22,62,18,6,"#85858c","#4c4d53")+text(455,35,"R2",10,"#202128")+
    text(300,34,"REAR SHOULDERS",9)+path("M113 60H176V75H113ZM424 60H487V75H424Z","#777880","#4c4d53")+
    path(shell,"#bebfc5","#747680")+
    path("M85 135Q88 91 120 83M84 158L63 258Q60 276 74 282M517 157L538 258Q541 276 527 282","none","#e1e2e6")+
    circle(147,142,65,"#b3b4bc","#a0a1a8")+circle(454,145,65,"#b3b4bc","#a0a1a8")+
    // Four separated direction pieces are characteristic of the original Sony pad.
    path("M139 107H155Q159 107 159 112V123Q158 128 151 132Q147 135 143 132Q136 128 135 123V112Q135 107 139 107ZM143 153Q147 150 151 153Q158 157 159 162V173Q159 178 155 178H139Q135 178 135 173V162Q136 157 143 153ZM112 134H123Q128 135 132 142Q135 146 132 150Q128 157 123 158H112Q107 158 107 154V138Q107 134 112 134ZM162 142Q166 135 171 134H182Q187 134 187 138V154Q187 158 182 158H171Q166 157 162 150Q159 146 162 142Z","#44454d","#25262d")+
    button(454,183,"",17,"#41434b")+button(492,145,"",17,"#41434b")+button(416,145,"",17,"#41434b")+button(454,107,"",17,"#41434b")+
    '<path d="M447 176L461 190M461 176L447 190" fill="none" stroke="#79a4db" stroke-width="1.8"/>'+circle(492,145,9,"none","#ef7991")+
    '<rect x="408" y="137" width="16" height="16" fill="none" stroke="#db94b9" stroke-width="1.8"/><path d="M454 97L464 115H444Z" fill="none" stroke="#83bea9" stroke-width="1.8"/>'+
    rect(259,147,29,12,2,"#51525a","#292a32")+path("M316 142L339 153L316 164Z","#51525a","#292a32")+text(273,139,"SELECT",8,"#52535c")+text(327,139,"START",8,"#52535c")+text(145,70,"L1",9,"#25262b")+text(455,70,"R1",9,"#25262b");
  if(analog){
    for(const [x,start,click] of [[232,16,14],[368,20,15]]){
      body+=circle(x,217,44,"#b8b9c0","#7b7d86")+circle(x,217,30,"#4c4d55","#22242b")+circle(x,217,23,"#383a41","#60616a");
      controls[start]=region(x+20,217,20); controls[start+1]=region(x-20,217,20);controls[start+2]=region(x,237,20);controls[start+3]=region(x,197,20);controls[click]=region(x,217,18);
    }
    body+=rect(283,199,34,11,5,"#73747c","#363840")+text(300,191,"ANALOG",7,"#4b4c53")+rect(296,217,8,4,1,"#b7343b","#a02b30");
  }
  return {name:analog?"PlayStation DualShock (analog device required)":"PlayStation original digital controller",body,controls};
}
function lynx(){
  const controls={...directions(112,174,21,22),8:region(504,87,27),0:region(461,98,27),3:region(427,173,15,27),10:region(425,137,15,27),11:region(425,210,15,27)};
  controls[8].aliases=[region(504,263,27)];
  controls[0].aliases=[region(461,252,27)];
  const shell="M74 57L153 57L187 64H413L447 57H526Q564 168 526 288H447L413 296H187L153 288H74Q36 173 74 57Z";
  const body=path(shell,"#373a3e","#111417")+
    path("M187 64H413Q456 175 413 296H187Q145 175 187 64Z","#292d31","#111417")+
    rect(205,98,201,158,17,"#23272b","#565c61")+rect(215,115,181,119,3,"#131b1e","#111719")+text(305,88,"LYNX",17,"#d89442")+
    cross(112,174,67)+
    [[461,98,"B",-16],[504,87,"A",-16],[461,252,"B",16],[504,263,"A",16]].map(([x,y,label,angle])=>`<g transform="rotate(${angle} ${x} ${y})">${rect(x-18,y-18,36,36,4,"#202327","#15181c")}${button(x,y,"",13,"#53575c")}</g>`+text(x-17,y+(y<180?-22:25),label,8,"#a4a7aa")).join("")+
    [[137,"OPTION 1"],[173,"Ⅱ"],[210,"OPTION 2"]].map(([y,label],i)=>rect((i===1?427:425)-7,y-14,14,28,4,"#54595e","#11161a")+text(426,i===0?117:i===1?176:234,label,7,"#d89442")).join("")+
    [[137,"ON"],[173,"OFF"],[210,"BACKLIGHT"]].map(([y,label],i)=>rect(176,y-14,14,28,4,"#54595e","#11161a")+text(183,i===0?116:i===1?193:234,label,7,"#d89442")).join("")+
    Array.from({length:7},(_,i)=>{const x=450+i*10,top=137-i*2,bottom=211+i*2;return `<path d="M${x} ${top}Q${x+5} 174 ${x} ${bottom}" fill="none" stroke="#161b1e" stroke-width="3"/>`;}).join("")+
    `<path d="M154 130Q146 174 154 221M160 131Q152 174 160 220" fill="none" stroke="#161b1e" stroke-width="3"/>`+text(300,321,"Lynx II · front view · duplicate A/B buttons",12);
  return {name:"Atari Lynx II",body,controls};
}
function cdi(){
  // Philips CDI 350 service manual, page 5: four curved action keys around
  // a thumbstick and eight small playback/volume keys; no invented TV slider.
  const body=path("M243 34Q300 22 357 34L357 217Q356 263 345 305H255Q244 263 243 217Z","#292c31","#111318")+
    path("M254 31Q300 22 346 31V35H254Z","#16191e","#484e57")+path("M245 150H355","none","#101419")+
    circle(300,94,43,"#3f444b","#16191e")+circle(300,94,37,"#242a30","#65707b")+circle(300,94,12,"#777f89","#13191f")+circle(300,94,6,"#242b34","#555e69")+
    [0,90,180,270].map(a=>`<g transform="rotate(${a} 300 94)">${path("M259 58L266 49Q274 40 283 37L287 46Q272 51 267 65Z","#4b545e","#111820")}</g>`).join("")+
    [[273,170,"Ⅱ"],[327,170,"□"],[273,189,"|◁"],[300,189,"▷"],[327,189,"▷|"],[273,208,"M"],[300,208,"−"],[327,208,"+"]].map(([x,y,l])=>circle(x,y,6,"#828d98","#10161e")+text(x,y-9,l,7,"#c3cbd1")).join("")+
    text(300,241,"CD-i",13)+text(300,329,"22ER9051 thumbstick remote · illustration only",11);
  return {name:"Philips 22ER9051 CD-i pointing remote (unassignable)",body,controls:{}};
}

export function getOtherArt(layout){
  switch(layout.systemId){
    case "atari2600":return cx40();case "atari5200":return cx52();case "atari7800":return cx24();
    case "tg16":case "tgcd":return turbo();case "jaguar":return jaguar();case "psx":return playstation(layout.variant.id==="dual-analog");case "lynx":return lynx();case "cdi":return cdi();default:return null;
  }
}
