# Platform matrix

The current RetroSignal build exposes 21 launchable entries backed by pinned EmulatorJS 4.2.3 cores. “Configured” means the local core, report, extensions, save namespace, and controller table pass automated inspection. It does not substitute for a legal game-file boot test.

| System | Manager ID | Core | Supported files | Firmware | Status |
| --- | --- | --- | --- | --- | --- |
| Nintendo 64 | `n64` | Mupen64Plus-Next | `.z64`, `.n64`, `.v64`, `.zip`, `.7z` | None | Previously booted; rc.4 regression pending |
| Game Boy / Game Boy Color | `gb` | Gambatte | `.gb`, `.gbc`, `.dmg`, `.zip`, `.7z` | None | Configured |
| Game Boy Advance | `gba` | mGBA | `.gba`, `.zip`, `.7z` | None | Configured |
| Atari 2600 | `atari2600` | Stella 2014 | `.a26`, `.bin`, `.zip`, `.7z` | None | Configured |
| Atari 5200 | `atari5200` | a5200 | `.a52`, `.bin`, `.rom`, `.zip`, `.7z` | Core-dependent | Configured; real boot pending |
| Nintendo Entertainment System | `nes` | FCEUmm | `.nes`, `.unf`, `.unif`, `.zip`, `.7z` | None | Configured |
| Sega Master System | `mastersystem` | SMS Plus GX | `.sms`, `.sg`, `.bin`, `.zip`, `.7z` | None | Configured; real boot pending |
| Atari 7800 | `atari7800` | ProSystem | `.a78`, `.bin`, `.zip`, `.7z` | Optional | Configured; real boot pending |
| TurboGrafx-16 / PC Engine | `tg16` | Mednafen PCE Fast | `.pce`, `.sgx`, `.zip`, `.7z` | None | Configured; real boot pending |
| Sega Genesis / Mega Drive | `genesis` | Genesis Plus GX | `.md`, `.smd`, `.gen`, `.bin`, `.zip`, `.7z` | None | Configured; real boot pending |
| TurboGrafx-CD / PC Engine CD | `tgcd` | Mednafen PCE Fast | `.chd`, `.cue`, `.ccd`, `.iso`, `.zip`, `.7z` | System card required | Configured; real boot pending |
| Super Nintendo | `snes` | Snes9x | `.sfc`, `.smc`, `.fig`, `.swc`, `.zip`, `.7z` | None | Configured |
| Philips CD-i | `cdi` | SAME_CDI | `.chd`, `.cue`, `.iso`, `.zip`, `.7z` | `cdimono1.zip` required; mounted at `same_cdi/bios/` | Configured; real boot pending |
| Sega CD / Mega-CD | `segacd` | Genesis Plus GX | `.chd`, `.cue`, `.iso`, `.zip`, `.7z` | Region-compatible BIOS required | Configured; real boot pending |
| Atari Jaguar | `jaguar` | Virtual Jaguar | `.j64`, `.jag`, `.rom`, `.abs`, `.cof`, `.bin`, `.zip`, `.7z` | None | Configured; real boot pending |
| Sega 32X | `sega32x` | PicoDrive | `.32x`, `.bin`, `.md`, `.smd`, `.zip`, `.7z` | None | Configured; real boot pending |
| Sega Saturn | `saturn` | Yabause | `.chd`, `.cue`, `.ccd`, `.iso`, `.zip`, `.7z` | BIOS required by RetroSignal configuration | Configured; real boot pending |
| PlayStation | `psx` | PCSX-ReARMed | `.chd`, `.pbp`, `.iso`, `.zip`, `.7z` | 512 KiB BIOS required | Configured; real boot pending |
| Atari Lynx | `lynx` | Handy | `.lnx`, `.lyx`, `.zip`, `.7z` | None | Configured; real boot pending |
| Sega Game Gear | `gamegear` | Genesis Plus GX | `.gg`, `.bin`, `.zip`, `.7z` | None | Configured; real boot pending |
| Virtual Boy | `virtualboy` | Beetle VB | `.vb`, `.vboy`, `.bin`, `.zip`, `.7z` | None | Configured; real boot pending |

Game Boy and Game Boy Color deliberately retain one combined entry so existing `gb-*` save namespaces remain compatible.

## Not launchable yet

| System | Reason |
| --- | --- |
| Sega Dreamcast | EmulatorJS 4.2.3 has no supported Dreamcast core. A second backend such as Flycast would be required. |
| Atari Jaguar CD | The available Virtual Jaguar web core does not provide Jaguar CD support. |

RetroSignal does not provide games or firmware. Every new platform still requires boot, video, audio, controller, in-game save, manager restore, wallpaper restart, and PC restart validation with user-supplied legal files before public-release approval.
