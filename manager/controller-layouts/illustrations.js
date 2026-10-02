import { getNintendoArt } from './art-nintendo.js';
import { getSegaArt } from './art-sega.js';
import { getOtherArt } from './art-other.js';
export function controllerArt(layout) {
  const art=getNintendoArt(layout) || getSegaArt(layout) || getOtherArt(layout);
  if(!art)throw new RangeError(`Missing controller illustration: ${layout.systemId}`);
  return art;
}
export function controllerSvg(layout) {
  const art=controllerArt(layout);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 340" aria-hidden="true" focusable="false">${art.body}</svg>`;
}
