# Manager-only tester checklist

Use a new test profile. Keep personal ROMs, BIOS, saves and installed wallpaper folders outside the test. Record the exact executable/version, Windows version, display scale and result directory.

## Packaged automated acceptance

Coordinate visible windows first, then run with Node 22+ from the repository:

```powershell
$env:RETROSIGNAL_ALLOW_VISIBLE_GUI_TEST = '1'
node tests/manager-only-acceptance.mjs 'dist/manager-only-preview-20261002/win-unpacked/RetroSignal Manager.exe' 'dist/manager-only-acceptance-20261002'
```

The output directory must be new. The harness uses the package's normal entry, native Chromium debugging, and isolated local/roaming/Chromium/temp directories. It closes only the executable it spawned and that process's children. It leaves evidence in the output directory and does not run an installer, launch Lively, or read the user's games.

- [ ] `result.json` reports `passed: true`; review `cleanup.json` and screenshots.
- [ ] Package inventory and runtime requests contain no Garden code/assets; Garden UI, bridge methods and state are absent; the Garden asset route returns 404.
- [ ] All 21 controller diagrams open. Mapping edits, live keyboard labels, system switching, save and page reload work; a reset can be saved.
- [ ] Mapping close/Escape/Tab, remembered expansion, Manager preferences and narrow layouts work.
- [ ] Generated import-only `.nes` bytes import once, preserve bytes, skip duplicates and remain visible after reload.
- [ ] Standalone selector opens from the isolated player library, display settings update live, reset retains softness, and closing the player leaves Manager usable.
- [ ] Lively process IDs remain unchanged. No emulator save files or Garden state appear.

The synthetic file contains no playable program. Its successful import does **not** prove a core boots or a game plays. A passing harness does not replace the manual checks below. Failure details appear in `failure.json`; incomplete runs are not passes.

## Manual checks on a clean Windows machine

- [ ] Test the Windows x64 installer as a normal user: installation, shortcuts, launch, upgrade, uninstall and intentional data retention. An unpacked preview does not establish installer acceptance.
- [ ] Test without a separate Node or emulator installation and without Lively. Electron/Node, EmulatorJS and selected cores are bundled; first launch creates the private player runtime under `%LOCALAPPDATA%\RetroSignal\Player`.
- [ ] Record the tested Windows version and CPU/GPU/RAM/display configuration. The existing docs do not establish a minimum supported Windows version or hardware baseline.
- [ ] Verify native prerequisites on that clean machine: Manager archive operations invoke Windows `tar`; optional Lively discovery/commands invoke `powershell.exe`. Check both supported ZIP/7z imports. Separate VC runtime/WebView requirements have not been demonstrated by this harness.
- [ ] Import an authorized playable homebrew or user-owned test ROM and, where required, authorized BIOS. Record fixture provenance locally without committing ROM/BIOS files. Verify import, core boot, actual picture/audio, keyboard input, physical controller input and clean game exit separately.
- [ ] Verify save, game restart, Manager restart and save restoration in the test profile. Exercise BIOS-required systems and representative disc/archive formats separately; one NES import does not cover them.
- [ ] Check high-DPI/window resizing, F11 fullscreen and F10 display switching. Open/close the standalone player repeatedly and verify no abandoned player windows/processes.
- [ ] For optional wallpaper mode, separately install Lively and add the wallpaper folder. Test explicit Open Lively, library pairing, wallpaper input and standalone transitions with Lively stopped, running and manually paused. Preserve the initial playback state.

## Distribution obligations still requiring resolution

This checklist records repository evidence; it is not legal clearance.

- [ ] Resolve the explicit public-release blocker in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md): complete corresponding source for the exact pinned GPL core binaries. Included upstream links, checksums and build reports do not establish source delivery. The reviewed build reports identify build times/options, not source commits; no matching core source bundle or offer was demonstrated.
- [ ] Verify matching mGBA source availability and recipient instructions under the included [MPL 2.0 text](../LICENSES/MGBA-MPL-2.0.txt).
- [ ] Resolve restrictions for Genesis Plus GX, PicoDrive and Snes9x before deciding distribution/commercial terms. [RESTRICTED-CORE-NOTICE.txt](../LICENSES/RESTRICTED-CORE-NOTICE.txt) expressly does not replace the linked upstream full licenses; verify their inclusion for the exact binaries.
- [ ] Reconcile Virtual Jaguar's notice-table GPL-2.0 label with [its upstream notice](../LICENSES/VIRTUALJAGUAR-UPSTREAM-NOTICE.txt), which says GPL v3 or later.
- [ ] Preserve included EmulatorJS JavaScript source, modified-source notices, component licenses, model/HDR attribution and core checksums in the final artifacts. Inspect final package contents after changes.
- [ ] Reconcile stale Lively pause/resume statements between the root README and Manager README against the final implementation before distribution.

Existing notices and license files are useful inputs to review. They do not establish completion of the obligations above.

