// A playback lease must own its pause; an unknown prior state is never resumed.
export async function openPlayerWindow({ create, setup = () => {}, load, configure, focus, acquirePlaybackLease = async () => null }) {
  const lease = await acquirePlaybackLease();
  let window;
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await lease?.release?.();
  };
  try {
    window = create();
    window.on('closed', () => { void release().catch(() => {}); });
    setup(window);
    await load(window);
    await configure(window);
    focus(window);
    return window;
  } catch (error) {
    try { if (window && !window.isDestroyed()) window.destroy(); }
    finally { await release().catch(() => {}); }
    throw error;
  }
}
