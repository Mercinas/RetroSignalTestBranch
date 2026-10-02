# Changelog

## Unreleased

- Adds a single shareable Windows ZIP containing the Lively wallpaper folder, one-click Manager installer, and start-here instructions.
- Replaces manual installed-wallpaper path entry with automatic Lively library discovery and refreshes the authenticated wallpaper connection whenever Manager starts.
- Adds a Lively-configurable import/rescan key with Numpad `*` as the default; it scans the remembered ROM/BIOS source before refreshing the selector.
- Installs RetroSignal Manager with Desktop and Start menu shortcuts using a generated CRT television icon.
- Reduces Lively Customize to active game, rescan, display, and TV-view controls.
- Replaces the N64-only Manager quick start and nonexistent per-system library path with one source-folder workflow that creates configured ROM and BIOS destinations automatically.
- Imports firmware from `bios/<system-id>` source folders, validates configured firmware sizes, and reports BIOS conflicts without overwriting existing files.
- Removes obsolete Lively manual system/start/stop controls, the unused N64 desktop picker, retired Manager sync code, and unused Three.js post-processing assets.

## 1.0.0-rc.4

- Removes every `folderDropdown` from Lively Customize, avoiding the WinUI crash reproduced with a populated RetroSignal library.
- Adds the RetroSignal Manager foundation for ROM/BIOS manifests, pre-boot save restore, 30-second save mirroring, atomic writes, and timestamped backups.
- Expands the launchable system registry from 7 to 21 systems with 11 additional pinned EmulatorJS 4.2.3 cores.
- Adds Atari 5200/7800/Lynx/Jaguar, Master System, Game Gear, Genesis, Sega CD/32X/Saturn, TurboGrafx-16/CD, CD-i, and Virtual Boy.
- Records Dreamcast and Jaguar CD as unsupported until a second emulator backend is introduced.
- Generalizes BIOS validation and preserves the legacy N64 and combined Game Boy/Game Boy Color save identities.
- Packages RetroSignal Manager as a local portable Windows application with a retro dashboard; automatic startup is still optional future work.
- Adds one-time recursive ROM-source import with system-aware destination routing, duplicate/conflict reporting, remembered source paths, and missing-folder creation.
- Separates system and game selection on the CRT, adds Enter/Tab selection and hierarchical Escape back actions, and exposes the Lively background game-return property.
- Makes manager saves complete, serialized, checksummed snapshots with rollback recovery and bounded retained backups.
- Makes migration idempotent with manifest preservation, backup coverage, strict target validation, and a migration marker.
- Mounts CD-i firmware at the SAME_CDI virtual path and requires the core's `cdimono1.zip` filename.
- Adds allowlist-based wallpaper packaging, tighter manager path/CORS checks, URL-safe managed filenames, and bounded archive fallback guards.

## 1.0.0-rc.3

- Adds F8/backtick CRT mode toggles plus arrow, Enter, and Escape navigation without requiring the Xbox View button.
- Fixes N64 ZIP launches with bounded native stored/DEFLATE extraction in a dedicated worker, standards-correct legacy names, compatibility fallback, and explicit worker timeouts.
- Treats HEAD requests as optional cache hints and always falls back to a normal GET on Lively-compatible local hosts.
- Closes setup overlays before launching and defers paused launches until Lively resumes.
- Keeps the emulator WebGL buffer readable by the curved CRT and handles the browser activation needed to resume a loaded core.
- Ignores non-fatal Wake Lock permission rejection instead of tearing down a healthy emulator.

## 1.0.0-rc.2

- Replaces the manual library manifest with an automatic persistent game catalog.
- Adds missing-file rescans and safe catalog cleanup without deleting game files.
- Adds a first-run CRT guide and an evidence-based browser storage diagnostic.
- Adds PS1 BIOS existence and 512 KiB size checks with clearer status messages.
- Extends lifecycle diagnostics for emulator frames, timers, message listeners, and audio resources.
- Cuts static room rendering to 15 FPS and redraws unchanged CRT menus only when their state changes.
- Removes repeated canvas uploads, shadow work, unused render passes, and per-frame diagnostics from production URLs.
- Reduces the TV and environment texture budgets while preserving the CRT composition.
- Restores EmulatorJS ROM, BIOS, and core caching by separating readable sources from debug mode.
- Cancels stale overlapping emulator starts and delayed background lifecycle work.
- Packages only the nine core builds reachable by the fixed seven-system configuration.

## 1.0.0-rc.1

- Adds seven-system game selection on the CRT.
- Adds isolated per-game saves and deterministic direct XInput mappings.
- Adds full emulator teardown on game changes, mode changes, and extended background pauses.
- Adds explicit start, stop, system-swap, and game-list controls in Lively.
- Replaces the inherited cabinet decals and preview media with neutral RetroSignal artwork.
- Keeps the animated music room, camera controls, and 30 FPS option.
