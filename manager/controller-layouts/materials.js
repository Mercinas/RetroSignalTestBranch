// Lighting changes paint only; physical geometry and input footprints remain shared.
const mix = (hex, target, amount) => {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16));
  return `#${rgb.map((value, index) => Math.round(value + (target[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
};

export function lightController(body, namespace) {
  const paints = new Map();
  const lit = body.replace(/<(path|rect|circle|ellipse)\b[^>]*>/g, element => element.replace(/fill="(#[\da-f]{6})"/i, (attribute, colour) => {
    const round = /^<(circle|ellipse)\b/.test(element);
    const key = `${colour.toLowerCase()}-${round ? 'round' : 'shell'}`;
    if (!paints.has(key)) paints.set(key, { id: `${namespace}-paint-${paints.size}`, colour, round });
    return `fill="url(#${paints.get(key).id})" filter="url(#${namespace}-bevel)"`;
  }));
  const definitions = [...paints.values()].map(({ id, colour, round }) => {
    const highlight = mix(colour, [255, 255, 255], .10);
    const shade = mix(colour, [0, 0, 0], .22);
    return round
      ? `<radialGradient id="${id}" cx="35%" cy="24%" r="78%"><stop stop-color="${highlight}"/><stop offset=".55" stop-color="${colour}"/><stop offset="1" stop-color="${shade}"/></radialGradient>`
      : `<linearGradient id="${id}" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="${highlight}"/><stop offset=".3" stop-color="${colour}"/><stop offset=".72" stop-color="${mix(colour, [0, 0, 0], .07)}"/><stop offset="1" stop-color="${shade}"/></linearGradient>`;
  }).join('');
  return `<defs>${definitions}<filter id="${namespace}-bevel" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation=".7" result="height"/><feSpecularLighting in="height" surfaceScale="2" specularConstant=".28" specularExponent="18" lighting-color="#ffffff" result="light"><feDistantLight azimuth="225" elevation="48"/></feSpecularLighting><feComposite in="light" in2="SourceAlpha" operator="in" result="trimmed"/><feComposite in="SourceGraphic" in2="trimmed" operator="arithmetic" k1="0" k2="1" k3=".45" k4="0"/></filter><filter id="${namespace}-shadow" x="-15%" y="-15%" width="130%" height="140%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#101824" flood-opacity=".22"/></filter></defs><g filter="url(#${namespace}-shadow)">${lit}</g>`;
}
