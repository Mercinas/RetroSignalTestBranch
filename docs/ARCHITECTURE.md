# RetroSignal architecture and interaction flow

This is the implementation record for the ROM and Lively navigation work. The
application name used below was confirmed from `LivelyInfo.json` (`Title`), the
wallpaper package metadata, and the existing page titles: **RetroSignal**.

## Existing flow before this change

1. Lively loads `index.html`, which creates the room renderer and a hidden
   `#emulator-shell` below the CRT compositor.
2. `js/retrosignal.js` owns wallpaper state, the system catalog, keyboard and
   controller input, the Lively callbacks, and the selected ROM catalog.
3. `js/systems.js` is the source of truth for the 21 configured systems, their
   EmulatorJS cores, ROM extensions, destination folders, and BIOS rules.
4. The wallpaper restores a browser catalog, imports
   `roms/library.local.json` when present, checks every catalog path, and asks
   `js/emulator-host.js` to create one EmulatorJS iframe for a validated launch.
5. The companion manager at `manager/server.js` can pair an installed wallpaper
   by writing `manager.json`, recursively import one connected ROM/BIOS source
   folder, and write the local manifest. Its Electron shell provides source and
   installed-folder pickers in `manager/electron-main.mjs`.
6. `livelyWallpaperPlaybackChanged` pauses/resumes the render and emulator
   lifecycle. `livelyPropertyListener` handles Customize controls. Keyboard
   input is received when Lively Wallpaper Input is set to Keyboard; the
   shortcut gate removes duplicate focused/background delivery.

Before this work, the selector displayed systems and the current game together
in one view. Enter launched the current game immediately, and Escape returned
from a running game to that selector but then left game mode when pressed from
the selector. ROM import required putting files in the manager’s per-system
folders and pairing/syncing them manually.

## Target flow

The manager now accepts one connected ROM source folder, recursively classifies
files using the configured system IDs and extension table, copies them into the
configured wallpaper ROM and BIOS roots, and merges the manifest without
overwriting a different file. Missing source/destination directories are
created as needed; unsupported, ambiguous, invalid, duplicate, and failed
entries are reported. Compressed ROMs are classified from archive member formats
and known disc signatures. A normally named, correctly sized PS1 BIOS is
recognized at the source root; other BIOS files are recognized below
`bios/<system-id>` and validated against the configured firmware rules.

The wallpaper has two explicit selector levels:

- **System selection:** arrow keys move through configured systems; Enter (or
  Tab) opens the selected system’s game list.
- **Game selection:** arrow keys move through games compatible with the selected
  system; Enter (or Tab) launches the highlighted game; Escape returns to system
  selection.

Escape from a running game, the native Lively `backToGameSelection` property,
and the controller stop chord return to the selected system’s game list. F8 or
backtick still toggles game mode. Global playback remains Lively-owned: bind
Lively’s `app --play true/false` command for start/stop or pause/resume, while
the wallpaper’s existing playback callback keeps the TV and emulator lifecycle
in sync.

## Proof path

The focused proof is `npm test`, which covers the system catalog, extension and
destination filtering, recursive ROM classification/import behavior, duplicate
handling, keyboard action mapping, selector back-navigation, Lively property
exposure, launch validation, and manager failure responses. A local manager
round trip with temporary folders exercises the same source scan, copy, and
manifest path used by the desktop app.
