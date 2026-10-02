// Paired libraries may contain older runtime code. Keep their paths and saves,
// and use their existing property interface as well as the current event bridge.
export function normalizePlayerSettings(options = {}) {
  const bounded = (value, low, high, fallback) => Number.isFinite(Number(value)) ? Math.max(low, Math.min(high, Number(value))) : fallback;
  const monochrome = options.monochrome === true;
  return {
    blur: bounded(options.blur, 0, 4, 1),
    monochrome,
    sepia: !monochrome && options.sepia === true,
    hue: bounded(options.hue, -180, 180, 0),
    saturation: bounded(options.saturation, 0, 200, 100),
    contrast: bounded(options.contrast, 50, 150, 100),
  };
}

export function playerSettingsScript(options = {}) {
  const settings = normalizePlayerSettings(options);
  const filters = [];
  if (settings.monochrome) filters.push('grayscale(1)');
  else {
    if (settings.sepia) filters.push('sepia(1)');
    if (settings.hue) filters.push(`hue-rotate(${settings.hue}deg)`);
    if (settings.saturation !== 100) filters.push(`saturate(${settings.saturation / 100})`);
  }
  if (settings.contrast !== 100) filters.push(`contrast(${settings.contrast / 100})`);
  const colorFilter = filters.join(' ') || 'none';
  return `(() => {
    const detail = ${JSON.stringify({ crtBlur: settings.blur * 0.5, crtMonochrome: settings.monochrome })};
    const canvas = document.querySelector('#standalone-game-screen');
    if (canvas) canvas.style.filter = detail.crtBlur ? 'blur(' + detail.crtBlur + 'px)' : 'none';
    // Apply once to the presented canvas, including menus. Older runtimes blur
    // game pixels internally; disable that pass to avoid doubling the effect.
    const internalBlur = canvas ? 0 : detail.crtBlur;
    window.livelyPropertyListener?.('crtBlur', internalBlur);
    window.dispatchEvent(new CustomEvent('retrosignal-settings', { detail: { ...detail, crtBlur: internalBlur } }));
    document.documentElement.style.filter = ${JSON.stringify(colorFilter)};
  })()`;
}
