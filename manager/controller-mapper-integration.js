import { mountControllerMapper } from '/controller-layouts/component.js';
import { effectiveBindings, getLayout, bindingConflicts } from '/controller-layouts/layouts.js';
import { initializeSystemPanel } from '/controller-layouts/system-panel.js';

export async function initializeControllerMappers(document, fetcher = fetch) {
  if(document.querySelector)initializeSystemPanel(document);
  const hosts = [...document.querySelectorAll('[data-controller-mapper]')];
  let payload;
  try {
    const response = await fetcher('/api/v1/library');
    if (!response.ok) throw new Error('Saved mappings could not be loaded.');
    payload = await response.json();
  } catch (error) {
    for (const host of hosts) host.textContent = `${error.message} Reopen the Manager to retry. Nothing was changed.`;
    return;
  }
  for (const host of hosts) {
    const systemId = host.dataset.systemId;
    const prior = effectiveBindings(payload.controls?.[systemId] || []);
    const supported = payload.capabilities?.keyboardMapping === true && getLayout(systemId).controls.length > 0;
    host.replaceChildren();
    let variantId = getLayout(systemId).variant.id;
    let saving = false; let conflicts = bindingConflicts(prior);
    const mapper = mountControllerMapper(host, {
      systemId, bindings: prior, capabilities: { keyboardMapping: supported },
      onChange: change => { variantId = change.variantId; conflicts = change.conflicts; save.disabled = saving || conflicts.length > 0; status.textContent = conflicts.length ? 'Resolve duplicate keys before saving.' : 'Unsaved changes.'; },
    });
    host.closest?.('.system-details')?.addEventListener('controller-panel-close',()=>mapper.releaseHighlights());
    const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save keyboard mapping'; save.disabled = !supported || conflicts.length > 0;
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    status.textContent = supported ? 'Changes apply when you restart the game.' : 'This paired runtime does not support saved keyboard mappings. Preview only; your library and saves are preserved.';
    host.append(save, status);
    save.addEventListener('click', async () => {
      if (saving || !supported || conflicts.length) return;
      const values = mapper.getBindings();
      const patch = Object.fromEntries(values.flatMap((key, id) => key === prior[id] ? [] : [[id, key]]));
      saving = true; save.disabled = true; status.textContent = 'Saving.';
      try {
        const response = await fetcher('/api/v1/controls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemId, variantId, bindings: patch }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not save mapping.');
        // Do not replace the editor with a response: edits made during saving win.
        for (const [id, key] of Object.entries(patch)) prior[Number(id)] = key;
        status.textContent = values.every((key, id) => mapper.getBindings()[id] === key) ? 'Saved. Restart the game to use this mapping.' : 'Saved earlier changes. New edits are still unsaved.';
      } catch (error) { status.textContent = error.message; }
      finally { saving = false; save.disabled = conflicts.length > 0; }
    });
  }
}

void initializeControllerMappers(document);
