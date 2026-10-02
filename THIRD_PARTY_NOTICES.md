# Third-party notices

RetroSignal includes the following separately licensed components and assets.

## Distribution status

The bundled Genesis Plus GX and PicoDrive cores have non-commercial terms. Any
RetroSignal bundle containing them must not be sold, included in a commercial
product or activity, or described as commercially redistributable. See
`LICENSES/RESTRICTED-CORE-NOTICE.txt` and the upstream full texts it links.

Several bundled cores are GPL-licensed. Before a public release, the publisher
must provide the complete corresponding source for the exact pinned core builds
in the same distribution channel (or a valid written offer where permitted).
Repository links and checksums alone are not a verified source-compliance
process, so this remains a release blocker.

## Wallpaper and rendering

- Audio visualizer wallpaper scene by Rocksdanister — MIT — [source](https://github.com/rocksdanister/audio-visualizer-wallpaper)
- Three.js r147 — MIT — [source](https://github.com/mrdoob/three.js/tree/r147)
- Color Thief — MIT — [source](https://github.com/lokesh/color-thief)
- Old TV model by visualdiscette — CC BY 4.0 — [source](https://sketchfab.com/3d-models/old-tv-3fb1a4b9d14c44abaac69fec119bf251)
- Colorful Studio environment by Poly Haven — CC0 1.0 — [source](https://polyhaven.com/a/colorful_studio)

The MIT text is in `LICENSE`. Creative Commons texts are in `LICENSES/CC-BY-4.0.txt` and `LICENSES/CC0-1.0.txt`.

## Desktop manager runtime

The RetroSignal Manager Windows installer bundles Electron 44.0.0 — MIT — [source](https://github.com/electron/electron/tree/v44.0.0). Its installed runtime includes `LICENSE.electron.txt` and `LICENSES.chromium.html` for Electron and Chromium notices. The wallpaper folder itself does not include Electron.

## Emulator frontend

EmulatorJS 4.2.3 is licensed under GPL-3.0. Its JavaScript source is included in `emulatorjs/src/`; RetroSignal changes `emulatorjs/loader.js` and `emulatorjs/src/GameManager.js` to pass and mount per-game save namespaces. The license is in `LICENSES/EMULATORJS-GPL-3.0.txt`.

Source: [EmulatorJS 4.2.3](https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3)

## Emulator cores

The bundled WebAssembly core packages are the unmodified EmulatorJS 4.2.3 builds. Build reports are in `emulatorjs/cores/reports/` and checksums are in `emulatorjs/cores/SHA256SUMS`.

| Core | System | License | Source |
| --- | --- | --- | --- |
| Mupen64Plus-Next | Nintendo 64 | GPL-2.0 | [source](https://github.com/EmulatorJS/mupen64plus-libretro-nx) |
| Gambatte | Game Boy / Game Boy Color | GPL-2.0 | [source](https://github.com/EmulatorJS/gambatte-libretro) |
| mGBA | Game Boy Advance | MPL-2.0 | [source](https://github.com/EmulatorJS/mgba) |
| Stella 2014 | Atari 2600 | GPL-2.0 | [source](https://github.com/EmulatorJS/stella2014-libretro) |
| Snes9x | Super Nintendo | Snes9x license | [source](https://github.com/EmulatorJS/snes9x) |
| FCEUmm | Nintendo Entertainment System | GPL-2.0 | [source](https://github.com/EmulatorJS/libretro-fceumm) |
| PCSX-ReARMed | PlayStation 1 | GPL-2.0 | [source](https://github.com/EmulatorJS/pcsx_rearmed) |
| a5200 | Atari 5200 | GPL-2.0 | [source](https://github.com/libretro/a5200) |
| ProSystem | Atari 7800 | GPL-2.0 | [source](https://github.com/libretro/prosystem-libretro) |
| SMS Plus GX | Sega Master System | GPL-2.0 | [source](https://github.com/libretro/smsplus-gx) |
| Genesis Plus GX | Master System, Game Gear, Genesis, Sega CD | Non-commercial | [source](https://github.com/libretro/Genesis-Plus-GX) |
| Beetle PCE Fast | TurboGrafx-16 / TurboGrafx-CD | GPL-2.0 | [source](https://github.com/libretro/beetle-pce-fast-libretro) |
| SAME_CDI | Philips CD-i | GPL-2.0+ with component notices | [source](https://github.com/libretro/same_cdi) |
| Virtual Jaguar | Atari Jaguar | GPL-2.0 | [source](https://github.com/libretro/virtualjaguar-libretro) |
| PicoDrive | Sega 32X | MAME non-commercial license | [source](https://github.com/notaz/picodrive) |
| Yabause | Sega Saturn | GPL-2.0+ | [source](https://github.com/libretro/yabause) |
| Handy | Atari Lynx | zlib | [source](https://github.com/libretro/libretro-handy) |
| Beetle VB | Virtual Boy | GPL-2.0 | [source](https://github.com/libretro/beetle-vb-libretro) |

The standard GPL-2.0 and zlib texts are in `LICENSES/GPL-2.0.txt` and
`LICENSES/ZLIB.txt`. Snes9x, Genesis Plus GX, and PicoDrive are limited to
non-commercial use by their licenses; RetroSignal releases containing those
cores must remain non-commercial. See the distribution-status requirement above
for the separate GPL corresponding-source blocker.
