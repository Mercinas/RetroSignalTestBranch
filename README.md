# RetroSignalTestBranch

Your games, one folder, a CRT on your desktop. RetroSignal combines a local game library and standalone emulator player with an optional music-room wallpaper for Lively.

This Windows x64 test build includes the Manager, EmulatorJS, and the configured emulator cores. You do not need to install Node.js or a separate emulator. Bring your own authorized games and any required BIOS files; none are included. The garden is not part of this Manager build.

## Start playing

1. Download the [Windows portable playtest ZIP](https://github.com/Mercinas/RetroSignalTestBranch/releases/download/playtest-manager-1/RetroSignal-Manager-Private-Playtest-Windows-x64.zip). GitHub's **Code → Download ZIP** contains source code, not the ready-to-run application.
2. Extract the **entire** ZIP into a folder you can write to. Keep the `App` folder and the other files together; do not launch from inside the ZIP.
3. Open the extracted `RetroSignal-Manager` folder and double-click **Setup.cmd**. It creates a **RetroSignal Playtest** desktop shortcut and opens the Manager. No installer or administrator rights are required. You can also run **Start-RetroSignal.cmd** directly.
4. Put your ROMs and BIOS files in one game folder. In the Manager, select **Choose folder**, choose that folder, then click **Import games**.
5. Expand a system under **Configured systems and formats** to see imported games and any problems. Select **Open emulator player**, choose a system, and choose a game.

Keep the extracted folder in place. If you move it, run **Setup.cmd** again to update the shortcut. Use that shortcut or **Start-RetroSignal.cmd** for later launches so the portable data paths remain consistent.

Lively is optional. The Manager and standalone player work independently, and opening the Manager does not start Lively.

## Add games and BIOS files

The Manager remembers your source folder and scans its subfolders. It copies recognized files into its managed library, skips duplicates, and reports unsupported, ambiguous, or failed imports. Your source folder remains the place to add new games; click **Import games** again afterward.

Use system-named subfolders when formats overlap. For example:

```text
My Retro Games/
  nes/
  gba/
  psx/
  bios/
    psx/
    segacd/
```

ZIP and 7z game archives are supported by the import workflow and expanded for launch. Keep multi-file disc games, including their cue sheet and every referenced track, together in one archive. Archive extraction uses Windows' system `tar` utility, so ZIP/7z behavior still needs checking on your Windows version.

For PS1, a recognized 512 KiB BIOS such as `SCPH1001.BIN` or `SCPH5501.bin` can sit beside your games; recognized names are normalized during import. Put unusually named PS1 firmware in `bios/psx`. Other required firmware can be organized under the BIOS folders listed below. You do not need to browse Lively's internal application-data folders.

## Configured systems

These are the 21 system entries configured in this build. A bundled core and accepted extension do **not** establish that every game, BIOS, peripheral, or controller has been tested.

| System / source subfolder | Bundled core | Main loose-game formats | BIOS required by RetroSignal |
| --- | --- | --- | --- |
| Nintendo 64 — `n64` | Mupen64Plus-Next | `.z64`, `.n64`, `.v64` | No |
| Game Boy / Game Boy Color — `gb` | Gambatte | `.gb`, `.gbc`, `.dmg` | No |
| Game Boy Advance — `gba` | mGBA | `.gba` | No |
| Atari 2600 — `atari2600` | Stella 2014 | `.a26`, `.bin` | No |
| Atari 5200 — `atari5200` | a5200 | `.a52`, `.bin`, `.rom` | No |
| NES — `nes` | FCEUmm | `.nes`, `.unf`, `.unif` | No |
| Master System — `mastersystem` | SMS Plus | `.sms`, `.sg`, `.bin` | No |
| Atari 7800 — `atari7800` | ProSystem | `.a78`, `.bin` | No |
| TurboGrafx-16 / PC Engine — `tg16` | Mednafen PCE | `.pce`, `.sgx` | No |
| Genesis / Mega Drive — `genesis` | Genesis Plus GX | `.md`, `.smd`, `.gen`, `.bin` | No |
| TurboGrafx-CD / PC Engine CD — `tgcd` | Mednafen PCE | `.chd`, `.cue`, `.ccd`, `.iso` | System card in `bios/tgcd` (`.pce`, `.rom`, `.bin`) |
| Super Nintendo — `snes` | Snes9x | `.sfc`, `.smc`, `.fig`, `.swc` | No |
| Philips CD-i — `cdi` | SAME_CDI | `.chd`, `.cue`, `.iso` | `bios/cdi/cdimono1.zip` |
| Sega CD / Mega-CD — `segacd` | Genesis Plus GX | `.chd`, `.cue`, `.iso` | `bios/segacd` (`.bin`, `.rom`) |
| Atari Jaguar — `jaguar` | Virtual Jaguar | `.j64`, `.jag`, `.rom`, `.abs`, `.cof`, `.bin` | No |
| Sega 32X — `sega32x` | PicoDrive | `.32x`, `.bin`, `.md`, `.smd` | No |
| Sega Saturn — `saturn` | Yabause | `.chd`, `.cue`, `.ccd`, `.iso` | `bios/saturn` (`.bin`, `.rom`) |
| PlayStation 1 — `psx` | PCSX-ReARMed | `.chd`, `.pbp`, `.iso`; archive for BIN/CUE/IMG | 512 KiB BIOS in `bios/psx` |
| Atari Lynx — `lynx` | Handy | `.lnx`, `.lyx` | No |
| Game Gear — `gamegear` | Genesis Plus GX | `.gg`, `.bin` | No |
| Virtual Boy — `virtualboy` | Beetle VB | `.vb`, `.vboy`, `.bin` | No |

Dreamcast and Jaguar CD are not supported. The Manager shows the configured formats and BIOS requirements for each system, along with import status.

## Keyboard and controller controls

| Key | Action |
| --- | --- |
| Arrow keys | Navigate systems and games |
| Enter or Tab | Open the selected system or launch a game |
| Escape | Exit a game to its game list; go back through the selector |
| F8 or backtick | Switch between music and game mode |
| F11 | Toggle standalone-player fullscreen |
| F10 | Move the standalone player to the next display |
| Numpad `*` | Ask the running Manager to rescan the remembered game folder |

For an Xbox-style controller, use the D-pad to navigate, **A** to select, and **B** to go back. Hold **View + Menu** for two seconds to toggle game mode when the controller shortcut is enabled. During a game, hold **LB + RB + Y** for about 1.2 seconds to return to the game list. Physical controller compatibility still needs testing.

Gameplay buttons vary by system. Expand a system in the Manager for its **Controller mapping** and interactive **Keyboard mapping**. Select a control, assign a key, and save the mapping; restart the game to apply it. Duplicate assignments to active controls are rejected. For example, the standard NES diagram defaults to **Z = A**, **X = B**, **V = Select**, **Enter = Start**, with arrows for the D-pad. Use the diagram for the actual system rather than assuming the same letter means the same button everywhere.

Keyboard directions provide digital input, not variable analog pressure. Unverified keypad controls, CD-i mapping, and analog-device variants are unavailable where indicated. Older paired wallpaper runtimes may show mappings as read-only.

## Display, settings, and saves

The Manager's **Standalone player** section offers CRT softness, black-and-white, Sepia, hue, saturation, and contrast. Display changes apply live. Black-and-white and Sepia are mutually exclusive; black-and-white disables hue and saturation. **Reset colors** keeps your softness setting. **Manager settings** changes the Manager's font, text size, theme, layout, and motion preferences.

The portable launcher stores its imported library, settings, browser profile, and saves in **TestData** beside the launcher. Save snapshots and rotating backups are under:

```text
TestData/Local/RetroSignal/Saves/
TestData/Local/RetroSignal/Backups/
```

Keep the Manager running while playing. The save bridge is designed to restore saves before launch, mirror them every 30 seconds, and flush on orderly stop/pause. This backs up the game's save files; it does not replace using the game's own save function. Actual in-game save/restore remains part of playtesting.

Close the player and Manager before copying the entire **TestData** folder for a personal backup. Keep it when moving or replacing the portable app. Do not share a populated copy: it can contain your games, firmware, saves, and settings. A normal installed Manager instead uses `%LOCALAPPDATA%\RetroSignal` for its library and save vault.

## Optional Lively wallpaper

The installed Lively workflow has **not yet been runtime-tested for this build**. The following is the documented integration path:

1. Install and open Lively separately, or use the Manager's **Open Lively** button if Lively is already installed.
2. Add the separately supplied RetroSignal wallpaper package. In an extracted wallpaper folder, `index.html` is the entry point. The portable Manager ZIP alone is not the wallpaper distribution.
3. Add the wallpaper before importing games for wallpaper use. The Manager can discover a compatible paired wallpaper library; otherwise it uses its private standalone library. Check the Manager's status instead of assuming an existing standalone library has transferred.
4. Enable keyboard interaction in Lively's wallpaper-input settings. Press **F8** for game mode and use the selector controls above.
5. Under Lively **Customize**, use **Rescan hotkey** to change Numpad `*` to F6, F7, F9, R, or Disabled. **Exit game to game list** provides a game-back action. Keep the Manager open for imports and durable save snapshots.

The wallpaper is designed to pick up Manager catalog changes automatically. Lively controls its own wallpaper playback and fullscreen pause policy; the Manager does not automatically pause or resume Lively when you open or close the standalone player.

## If something does not work

- **No games appear:** check the import report, the accepted formats, and whether an ambiguous extension needs a system-named subfolder. Import again after adding files.
- **A BIOS is missing:** check the system's required BIOS folder, extension, and filename. PS1 firmware must also meet the configured size check.
- **Player runtime unavailable:** re-extract the complete package and launch through **Start-RetroSignal.cmd**.
- **A key change does nothing:** save the mapping, restart the game, and check whether the paired runtime supports editable mappings.
- **A game fails to boot:** record the system, game format, displayed error, and steps taken. A successful import only confirms catalog preparation, not game compatibility.

This is a test build. Real-ROM gameplay, BIOS boot behavior, physical controllers, in-game save persistence, installed Lively, and clean-machine acceptance are not established by this guide. When reporting a problem, include the app version, Windows version, system, expected result, and what happened. Do not include ROMs, BIOS files, or personal save data.

## Build from source

Install Node.js and npm for development, then run:

```powershell
npm ci
npm run manager
npm test
```

`npm run manager:package` builds the Windows Manager installer. `npm run package:wallpaper` builds the optional Lively wallpaper archive in `dist`. Development tools are not needed to run the portable download.

## Credits and licenses

RetroSignal builds on EmulatorJS and its emulator cores, Electron/Chromium, Three.js, Color Thief, Rocksdanister's audio-visualizer wallpaper, visualdiscette's Old TV model, and Poly Haven's Colorful Studio environment.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [LICENSE](LICENSE), and [LICENSES](LICENSES/) for attribution, source links, and license terms. Included components retain their own licenses. Some cores have non-commercial restrictions, and the notices record unresolved corresponding-source obligations for public distribution; this test build makes no additional distribution-clearance claim.


