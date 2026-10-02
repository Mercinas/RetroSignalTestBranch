// A failed local flush remains visible even if a recovery backup succeeds.
export async function flushSaveFileSystem(fileSystem, { backup, warn = () => {}, timeoutMs = 1000 } = {}) {
  if (!fileSystem?.syncfs) return { localFlushed: false, unavailable: true };
  const warnings = [];
  const report = message => { warnings.push(message); warn(message); };
  const error = await new Promise(resolve => {
    const timer = setTimeout(() => resolve(new Error('The local save flush timed out')), timeoutMs);
    const finish = failure => { clearTimeout(timer); resolve(failure || null); };
    try { fileSystem.syncfs(false, finish); }
    catch (failure) { finish(failure); }
  });
  if (error) report(`Local save persistence failed: ${error.message || error}. Keep the game open if possible and check your save backup.`);
  let backupTimer;
  try { await Promise.race([Promise.resolve().then(() => backup?.()), new Promise((_resolve, reject) => { backupTimer = setTimeout(() => reject(new Error('The save backup timed out')), timeoutMs); })]); }
  catch (failure) { report(`Save backup failed: ${failure.message || failure}.`); }
  finally { clearTimeout(backupTimer); }
  return { localFlushed: !error, warnings };
}
