# Per-system validation

Validation date: 2026-08-30

No user-supplied game, firmware, legacy save, or physical XInput controller is present in the working repository. Core files and configuration are not treated as proof that a system works. The original seven-system tables below keep their required results separate; every rc.4 addition is listed as real-file pending in [PLATFORM_MATRIX.md](PLATFORM_MATRIX.md).

Status meanings:

- **Pending input**: requires the named legal file or hardware.
- **Configured only**: automated inspection confirms the path or mapping exists, but real behavior is not proven.
- **Synthetic pass**: the outer lifecycle was exercised without loading a real core; active-core proof remains pending.

## Nintendo 64

| Check | Status | Evidence / required input |
| --- | --- | --- |
| ROM recognized | Pending input | Legal `.z64`, `.n64`, `.v64`, `.zip`, or `.7z` game |
| Core loads | Pending input | Same ROM |
| Video appears inside CRT | Pending input | Same ROM |
| Audio works | Pending input | Same ROM and audible Lively session |
| Controller input works | Pending input | Same ROM and physical XInput controller |
| Default mapping is sensible | Configured only | Deterministic N64 table passes automated bounds checks; gameplay review pending |
| Save created | Pending input | Same ROM with a known save action |
| Save restored after game swap | Pending input | Two legal ROMs and known save action |
| Save restored after wallpaper restart | Pending input | Same ROM and persistent Lively WebView storage |
| No second emulator remains active | Synthetic pass | Outer host never exceeded one frame; real N64 core swap pending |
| Stop and background teardown complete cleanly | Synthetic pass | Outer host reaches zero frames/timers; real core and audio teardown pending |

Legacy N64 compatibility is preserved in code by keeping the original game ID calculation, game name, and un-namespaced `/data/saves` mount. Loading an existing user save remains a required real-file test.

## Game Boy / Game Boy Color

| Check | Status | Evidence / required input |
| --- | --- | --- |
| ROM recognized | Pending input | Legal `.gb`, `.gbc`, `.dmg`, `.zip`, or `.7z` game |
| Core loads | Pending input | Same ROM |
| Video appears inside CRT | Pending input | Same ROM |
| Audio works | Pending input | Same ROM and audible Lively session |
| Controller input works | Pending input | Same ROM and physical XInput controller |
| Default mapping is sensible | Configured only | Deterministic GB/GBC table passes bounds checks; gameplay review pending |
| Save created | Pending input | Same ROM with a known save action |
| Save restored after game swap | Pending input | Two legal games and known save action |
| Save restored after wallpaper restart | Pending input | Same game and persistent Lively WebView storage |
| No second emulator remains active | Synthetic pass | Outer host never exceeded one frame; real Gambatte swap pending |
| Stop and background teardown complete cleanly | Synthetic pass | Outer host reaches zero frames/timers; real core and audio teardown pending |

## Game Boy Advance

| Check | Status | Evidence / required input |
| --- | --- | --- |
| ROM recognized | Pending input | Legal `.gba`, `.zip`, or `.7z` game |
| Core loads | Pending input | Same ROM |
| Video appears inside CRT | Pending input | Same ROM |
| Audio works | Pending input | Same ROM and audible Lively session |
| Controller input works | Pending input | Same ROM and physical XInput controller |
| Default mapping is sensible | Configured only | Deterministic GBA table passes bounds checks; gameplay review pending |
| Save created | Pending input | Same ROM with a known save action |
| Save restored after game swap | Pending input | Two legal games and known save action |
| Save restored after wallpaper restart | Pending input | Same game and persistent Lively WebView storage |
| No second emulator remains active | Synthetic pass | Outer host never exceeded one frame; real mGBA swap pending |
| Stop and background teardown complete cleanly | Synthetic pass | Outer host reaches zero frames/timers; real core and audio teardown pending |

## Atari 2600

| Check | Status | Evidence / required input |
| --- | --- | --- |
| ROM recognized | Pending input | Legal `.a26`, `.bin`, `.zip`, or `.7z` game |
| Core loads | Pending input | Same ROM |
| Video appears inside CRT | Pending input | Same ROM |
| Audio works | Pending input | Same ROM and audible Lively session |
| Controller input works | Pending input | Same ROM and physical XInput controller |
| Default mapping is sensible | Configured only | Deterministic Atari table passes bounds checks; gameplay review pending |
| Save created | Pending input | Same ROM if the title exposes persistent state |
| Save restored after game swap | Pending input | Suitable legal game files |
| Save restored after wallpaper restart | Pending input | Suitable game and persistent Lively WebView storage |
| No second emulator remains active | Synthetic pass | Outer host never exceeded one frame; real Stella swap pending |
| Stop and background teardown complete cleanly | Synthetic pass | Outer host reaches zero frames/timers; real core and audio teardown pending |

## Super Nintendo

| Check | Status | Evidence / required input |
| --- | --- | --- |
| ROM recognized | Pending input | Legal `.sfc`, `.smc`, `.fig`, `.swc`, `.zip`, or `.7z` game |
| Core loads | Pending input | Same ROM |
| Video appears inside CRT | Pending input | Same ROM |
| Audio works | Pending input | Same ROM and audible Lively session |
| Controller input works | Pending input | Same ROM and physical XInput controller |
| Default mapping is sensible | Configured only | Deterministic SNES table passes bounds checks; gameplay review pending |
| Save created | Pending input | Same ROM with a known save action |
| Save restored after game swap | Pending input | Two legal games and known save action |
| Save restored after wallpaper restart | Pending input | Same game and persistent Lively WebView storage |
| No second emulator remains active | Synthetic pass | Outer host never exceeded one frame; real Snes9x swap pending |
| Stop and background teardown complete cleanly | Synthetic pass | Outer host reaches zero frames/timers; real core and audio teardown pending |

## Nintendo Entertainment System

| Check | Status | Evidence / required input |
| --- | --- | --- |
| ROM recognized | Pending input | Legal `.nes`, `.unf`, `.unif`, `.zip`, or `.7z` game |
| Core loads | Pending input | Same ROM |
| Video appears inside CRT | Pending input | Same ROM |
| Audio works | Pending input | Same ROM and audible Lively session |
| Controller input works | Pending input | Same ROM and physical XInput controller |
| Default mapping is sensible | Configured only | Deterministic NES table passes bounds checks; gameplay review pending |
| Save created | Pending input | Same ROM with a known save action |
| Save restored after game swap | Pending input | Two legal games and known save action |
| Save restored after wallpaper restart | Pending input | Same game and persistent Lively WebView storage |
| No second emulator remains active | Synthetic pass | Outer host never exceeded one frame; real FCEUmm swap pending |
| Stop and background teardown complete cleanly | Synthetic pass | Outer host reaches zero frames/timers; real core and audio teardown pending |

## PlayStation 1

| Check | Status | Evidence / required input |
| --- | --- | --- |
| ROM recognized | Pending input | Legal `.chd`, `.pbp`, `.iso`, `.zip`, or `.7z` game plus the user's BIOS |
| Core loads | Pending input | Same game and BIOS |
| Video appears inside CRT | Pending input | Same game and BIOS |
| Audio works | Pending input | Same game, BIOS, and audible Lively session |
| Controller input works | Pending input | Same game, BIOS, and physical XInput controller |
| Default mapping is sensible | Configured only | Deterministic PS1 table passes bounds checks; gameplay review pending |
| Save created | Pending input | Same game with a known memory-card save action |
| Save restored after game swap | Pending input | Two legal games, BIOS, and known save action |
| Save restored after wallpaper restart | Pending input | Same game, BIOS, and persistent Lively WebView storage |
| No second emulator remains active | Synthetic pass | Outer host never exceeded one frame; real PCSX-ReARMed swap pending |
| Stop and background teardown complete cleanly | Synthetic pass | Outer host reaches zero frames/timers; real core and audio teardown pending |

The BIOS picker accepts only `.bin` or `.rom`, checks that the file exists, and requires the standard 512 KiB size. That is a sanity check, not proof of BIOS authenticity or game compatibility.
