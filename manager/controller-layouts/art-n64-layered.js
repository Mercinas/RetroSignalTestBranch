// Camera-projected geometry from the N64 3072-pixel Blender master.
const controls={
  "0": {
    "x": 373.8388442993164,
    "y": 145.6407928466797,
    "width": 22,
    "height": 22
  },
  "1": {
    "x": 355.9500503540039,
    "y": 124.89740371704102,
    "width": 22,
    "height": 22
  },
  "3": {
    "x": 300.9515380859375,
    "y": 127.37138748168945,
    "width": 18,
    "height": 18
  },
  "4": {
    "x": 210.55604934692383,
    "y": 103.96371841430664,
    "width": 18,
    "height": 18
  },
  "5": {
    "x": 210.55604934692383,
    "y": 134.9836540222168,
    "width": 18,
    "height": 18
  },
  "6": {
    "x": 195.33154964447021,
    "y": 119.75914001464844,
    "width": 18,
    "height": 18
  },
  "7": {
    "x": 226.16116523742676,
    "y": 119.75914001464844,
    "width": 18,
    "height": 18
  },
  "10": {
    "x": 210.36574363708496,
    "y": 60.00297546386719,
    "width": 37,
    "height": 9
  },
  "11": {
    "x": 390.20517349243164,
    "y": 60.19329071044922,
    "width": 37,
    "height": 9
  },
  "12": {
    "x": 507,
    "y": 291,
    "width": 44,
    "height": 23
  },
  "16": {
    "x": 315.22449493408203,
    "y": 182.75052070617676,
    "width": 11,
    "height": 14
  },
  "17": {
    "x": 290.1040744781494,
    "y": 182.75052070617676,
    "width": 11,
    "height": 14
  },
  "18": {
    "x": 302.66427993774414,
    "y": 195.31073570251465,
    "width": 14,
    "height": 11
  },
  "19": {
    "x": 302.66427993774414,
    "y": 170.19030570983887,
    "width": 14,
    "height": 11
  },
  "20": {
    "x": 415.3256034851074,
    "y": 108.91168594360352,
    "width": 17,
    "height": 17
  },
  "21": {
    "x": 380.6898498535156,
    "y": 108.91168594360352,
    "width": 17,
    "height": 17
  },
  "22": {
    "x": 398.1980323791504,
    "y": 125.08771896362305,
    "width": 17,
    "height": 17
  },
  "23": {
    "x": 398.1980323791504,
    "y": 92.16472625732422,
    "width": 17,
    "height": 17
  }
};
const layers=["shadow","shell","cable","recesses","buttons","stick","markings"];
function buildLayeredN64Art(){return {name:'Nintendo 64 · layered 3D controller',layered:true,controls,body:'<defs><filter id="n64-shadow-feather"><feGaussianBlur stdDeviation="8"/></filter><mask id="n64-shadow-mask" maskUnits="userSpaceOnUse" x="140" y="10" width="320" height="320"><rect x="154" y="24" width="292" height="292" rx="12" fill="white" filter="url(#n64-shadow-feather)"/></mask></defs>'+layers.map(name=>`<image data-asset-layer="${name}" href="/controller-assets/n64/${name}.png" x="140" y="10" width="320" height="320" ${name==='shadow'?'mask="url(#n64-shadow-mask)"':''}/>`).join('')+'<g><rect x="451" y="258" width="111" height="64" rx="8" fill="#252e3c" stroke="#64748b"/><text x="507" y="274" text-anchor="middle" fill="#d0d8e5" font-family="Arial" font-size="8">UNDERSIDE</text><rect x="485" y="280" width="44" height="23" rx="8" fill="#969da8" stroke="#dadee6"/><text x="507" y="296" text-anchor="middle" fill="#202938" font-family="Arial" font-size="12">Z</text><path d="M450 289H338" stroke="#8393a9" stroke-dasharray="3 4"/></g>'};}

export function getLayeredN64Art(){const art=buildLayeredN64Art();art.body+=[[0,'A',9],[1,'B',9],[3,'START',5]].map(([id,label,size])=>{const c=controls[id];return `<text data-ui-label="${label}" x="${c.x}" y="${c.y+size*.34}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="600" font-size="${size}" fill="#f5f7fa" stroke="#18212b" stroke-width=".35" paint-order="stroke">${label}</text>`;}).join('');return art;}
