# RetroSignal Manager

RetroSignal Manager is the local companion for one-folder ROM/BIOS importing, standalone emulator play, durable saves.

The Windows installer is built with:

```powershell
npm run manager:package
```

It creates Desktop and Start menu shortcuts using the CRT TV icon. The Electron app owns an internal loopback-only service and uses no account or cloud service. No browser Manager launcher is shipped.

The Manager and standalone player work without Lively installed or running. **Open Lively** is a separate explicit action for optional wallpaper mode. Opening or closing the Manager never starts Lively. The standalone player preserves Lively playback state. Automatic pause/resume commands are disabled because the CLI does not reliably report whether playback was already paused. Lively can apply its own fullscreen pause policy.

The installer bundles Electron/Node, the local EmulatorJS runtime and the pinned release cores. No separate emulator installation or routine first-run core download is required. Games and required firmware are not included. The first Manager launch prepares a private player runtime under `%LOCALAPPDATA%\RetroSignal\Player`; runtime updates preserve its imported games, BIOS files, controls and generated connection settings. Existing paired wallpaper libraries remain usable for compatible games and saves.

The user selects only one source folder. The Manager recursively scans it, inspects supported archives, expands ZIP/7z game archives into the configured system folders for fast launches, recognizes normally named PlayStation 1 BIOS files beside ROMs, and uses an existing compatible paired wallpaper library when available, otherwise its private player library. It creates internal destination folders, skips duplicates, avoids overwrites, regenerates both browser-readable catalog manifests, and remembers the source for Numpad `*` rescans.

For development, `npm run manager` starts the Electron app directly.

When paired, the Manager restores and mirrors saves through its authenticated loopback service. The wallpaper keeps browser storage as a fallback.

Controller previews use system-specific EmulatorJS input IDs and an interactive keyboard diagram. Saved mappings load before editing becomes available; saves merge changed input IDs and reject duplicate active-control keys. Changes apply on game restart. Older paired runtimes without the keyboard-config reader remain read-only, preserving their games and saves. Analog device selection and unverified keypad/CD-i controls remain unavailable.


