# Verification

Verification date: 2026-09-01

## Automated evidence

- `npm test` and `npm run check` pass 63 tests. They cover the 21-system registry and core matrix, recursive ROM/BIOS source classification/import, flat compressed ROM classification, root-level PS1 BIOS recognition and canonical filename repair, Lively responses that omit resource-size headers, duplicate and conflict reporting, missing-folder creation, automatic Lively wallpaper discovery, restart-time connection refresh, authenticated hotkey rescans, legacy N64 and combined GB/GBC save identities, hierarchical keyboard navigation and back actions, Lively property wiring, lifecycle cancellation, controller tables, migration idempotency, manager authentication and atomic save snapshots, save-bridge failure reporting, archive integrity/path checks, and fallback behavior.
- The release matrix retains 20 non-thread core builds reachable by the fixed configuration. Source checksums in `emulatorjs/cores/SHA256SUMS` are verified by the release check; each of the 21 systems has a matching core and build report.
- Native ZIP extraction rejects traversal, duplicate paths, unsupported compression, corrupt CRCs, declared-size mismatches, more than 2,048 entries, entries over 768 MiB, archives over 768 MiB, and total expanded content over 1 GiB. The legacy worker paths receive the same input, filename, file-count, per-file, and aggregate-output guards. Their extractor implementations have not received equivalent parser-level fuzzing.
- Manager save writes are serialized per namespace, staged as complete snapshots, checksummed in `manifest.json`, swapped with rollback protection, and keep ten timestamped backups. Reads validate the manifest and recover a valid interrupted stage or the newest backup if the active generation is absent.
- The migration tool backs up the Lively properties and existing manifest, rejects ambiguous targets, merges valid old and existing entries, writes a marker, and remains idempotent under automated tests.
- The manager is packaged as a one-click per-user NSIS installer with a CRT icon plus Desktop and Start menu shortcuts. Its service runs only on loopback and uses token-authenticated APIs. It does not register for automatic sign-in startup.
- The manager’s desktop flow remembers the selected ROM source in `rom-source.json`, discovers the compatible imported Lively wallpaper, and refreshes `manager.json` on every launch. Pair and rescan endpoints were exercised against temporary folders with nested N64/NES/GBA files, PS1 firmware, missing destination folders, duplicate content, unsupported extensions, ambiguous extensions, and an empty file.
- The wallpaper selector now has separate system and game levels. Enter/Tab opens or launches, Escape returns from game selection to system selection and from a running game to its game list, and the Lively `backToGameSelection` property uses the same path.
- `LivelyProperties.json` contains no `folderDropdown` controls. Its rescan dropdown defaults to Numpad `*`, and obsolete setup, missing-entry, and duplicate manual-rescan controls are absent.
- `npm run package` produced `RetroSignal-1.0.0-rc.5-Windows.zip`. Archive inspection confirmed the expected start guide, Manager installer, and wallpaper folder and found no Manager source, tests, tools, ROMs, BIOS, saves, local catalog, or profile data. Its exact SHA-256 is written beside it in the generated `.sha256` file.
- The final Manager was installed locally and its installed `app.asar` SHA-256 matched the packaged `win-unpacked` build exactly. The current installed wallpaper was refreshed while retaining its game catalog and detected PS1 BIOS; recognized PS1 dumps are normalized to the lowercase regional filename expected by PCSX-ReARMed.

## Physical and release validation still required

- Boot, graphics, audio, controller input, in-game save/load, manager restore, wallpaper restart, and PC restart must be tested with user-supplied legal game and firmware files for every system.
- CD-i must be boot-tested with a correctly named `cdimono1.zip`; RetroSignal mounts it at `same_cdi/bios/`, but static wiring is not proof of a successful core boot.
- Decide whether Manager should be enabled for automatic startup before publicly promising unattended rescan/save recovery immediately after Windows sign-in.
- Test a real Lively pause/resume, Customize panel, physical XInput controller, and the final generated wallpaper ZIP on supported Windows/Lively versions.
- Before public distribution, satisfy all licensing obligations for the exact packaged core binaries. Genesis Plus GX, PicoDrive, and Snes9x impose non-commercial restrictions. GPL corresponding-source availability still requires release/legal review.

No public release recommendation follows from automated tests alone. Record the results of the physical checks above against the final archive and exact build hash before approval.
