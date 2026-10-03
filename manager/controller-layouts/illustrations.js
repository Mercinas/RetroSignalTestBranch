import { getNintendoArt } from './art-nintendo.js';
import { getSegaArt } from './art-sega.js';
import { getOtherArt } from './art-other.js';
import { lightController } from './materials.js';
import { getRegisteredLayeredArt } from './art-layered.js';
export function controllerArt(layout) {
  const art=getRegisteredLayeredArt(layout) || getNintendoArt(layout) || getSegaArt(layout) || getOtherArt(layout);
  if(!art)throw new RangeError(`Missing controller illustration: ${layout.systemId}`);
  return art;
}
export function controllerSvg(layout) {
  const art=controllerArt(layout);
  const namespace = `controller-${layout.systemId}-${layout.variant.id}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="680" viewBox="0 0 600 340" aria-hidden="true" focusable="false">${art.layered ? art.body : lightController(art.body, namespace)}</svg>`;
}
