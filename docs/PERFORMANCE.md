# Performance log

Measurement date: 2026-08-30

## Test machine

| Item | Value |
| --- | --- |
| Windows | Windows 11 Home 10.0.26200, build 26200 |
| CPU | 11th Gen Intel Core i5-11260H @ 2.60 GHz |
| Installed RAM | 31.7 GiB usable (34,069,073,920 bytes reported) |
| GPU 1 | Intel UHD Graphics, driver 31.0.101.5333 |
| GPU 2 | NVIDIA GeForce RTX 3050 Laptop GPU, 4 GiB, driver 32.0.16.1088 |
| Display | 1920 × 1080 at 144 Hz |
| Lively | 2.2.1.5 |
| Browser engine | Microsoft Edge WebView2 151.0.4129.107 |
| RetroSignal | 1.0.0-rc.2; runtime optimization commits `0f5f606` and `0580108` |

## Method

Measurements use `tools/measure-performance.ps1`. The script discovers `Lively.exe`, `Lively.Watchdog.exe`, and every descendant process from the Windows process tree. It takes one sample per second and reports minimum, average, and maximum values for the complete Lively process group.

- RAM working set is the sum of each process's `WorkingSet64`. This is total resident working set, not JavaScript heap and not a private-working-set counter.
- Committed/private memory is the sum of each process's `PrivateMemorySize64`.
- Dedicated, shared, and total committed GPU memory come from the Windows `GPU Process Memory` performance counters for those process IDs.
- GPU utilization is the sum of Windows `GPU Engine` utilization counters belonging to those process IDs. Engines may operate in parallel, so the aggregate can exceed 100%; it is a workload indicator rather than one adapter-wide percentage.
- CPU is the change in summed process CPU time divided by elapsed time and logical processor count.
- Each row must use at least a five-second sample after the stated dwell time. Readings are total Lively usage unless a row explicitly reports an increment from the baseline.
- WebView2 uses multiple renderer, GPU, network, and storage child processes. Short-lived child processes and shared GPU allocations make individual samples uncertain; ranges are retained instead of a single point.
- RetroSignal's opt-in `?diagnostics=1` output records emulator frames, known pending timers and animation frames, message listeners, canvas redraws, and measurable EmulatorJS audio contexts/sources. Production URLs do not create or update this output.

Example:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/measure-performance.ps1 -Label "CRT library open" -SampleSeconds 10
```

## Results

`Awaiting file` means the measurement cannot be made honestly without a user-supplied legal game or BIOS. `Not yet measured` means the project can reach the state without those files, but a clean measurement has not been recorded yet. MiB values use 1,048,576 bytes.

| State | Dwell | Scope | Working set | Private bytes | Dedicated VRAM | Shared GPU | GPU engine | CPU | CRT diagnostics | Result |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Lively baseline without RetroSignal | 5 min | Total Lively; another local web wallpaper active | 1,132.8 / 1,134.0 / 1,136.4 MiB | 773.5 / 774.7 / 777.3 MiB | 0 / 0 / 0 MiB | 350.6 / 350.6 / 350.6 MiB | Not captured | 0 / 4 / 8% | n/a | 10 one-second samples; 9-process Lively group |
| RetroSignal music-room idle | 5 min | Total Lively; average increment from baseline in parentheses | 1,070.0 / 1,074.0 / 1,080.7 MiB (-60.0 MiB) | 699.4 / 703.5 / 710.4 MiB (-71.3 MiB) | 0 / 0 / 0 MiB | 313.0 / 313.0 / 313.0 MiB (-37.6 MiB) | Not captured | 1 / 2 / 3% | No game started; live hidden counter not captured | Clean ZIP installed; 10 one-second samples; 9-process group |
| CRT library open, no emulator | 5 min | Total Lively; average increment from baseline in parentheses | 1,068.9 / 1,070.5 / 1,071.9 MiB (-63.6 MiB) | 694.3 / 695.9 / 697.2 MiB (-78.8 MiB) | 0 / 0 / 0 MiB | 313.0 / 313.0 / 313.0 MiB (-37.6 MiB) | 30 / 31 / 32% aggregate | 2 / 3 / 6% | No emulator launched; live hidden counter not captured | Clean ZIP installed; 10 one-second samples; 9-process group |
| Optimized clean import, first-run CRT, no emulator | 6 min | Total Lively; Lively library UI closed | 1,075.6 / 1,078.1 / 1,081.3 MiB | 701.4 / 704.2 / 707.7 MiB | 0 / 0 / 0 MiB | 315.9 / 315.9 / 315.9 MiB | 31 / 31 / 32% aggregate | 1 / 2.5 / 4% | Production diagnostics intentionally absent; clean import contains no games | Two independent five-sample runs; 9-process group. The Lively library UI was excluded after its separate 330.4 MiB working set was identified. |
| Pre-optimization active emulator, system not recorded | Live session; 15 sec sample | Total Lively; 11-process group | 1,836.9 / 1,870.5 / 1,928.8 MiB | 2,130.1 / 2,163.7 / 2,221.7 MiB | 0 / 0 / 0 MiB | 533.3 / 534.3 / 535.0 MiB | 36 / 41 / 46% aggregate | 8 / 11 / 13% | Not captured | The user confirmed an emulator was running. Task Manager also showed a separate instantaneous 20% CPU peak outside this sample. The system, file, prior dwell, and exact gameplay state were not recorded, so this is diagnostic evidence only and is not a per-system validation row. |
| Nintendo 64 active | 5 / 15 min | Total Lively and increment | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting legal N64 ROM |
| Game Boy / Game Boy Color active | 5 / 15 min | Total Lively and increment | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting legal GB/GBC ROM |
| Game Boy Advance active | 5 / 15 min | Total Lively and increment | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting legal GBA ROM |
| Atari 2600 active | 5 / 15 min | Total Lively and increment | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting legal Atari 2600 ROM |
| Super Nintendo active | 5 / 15 min | Total Lively and increment | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting legal SNES ROM |
| Nintendo Entertainment System active | 5 / 15 min | Total Lively and increment | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting legal NES ROM |
| PlayStation 1 active | 5 / 15 min | Total Lively and increment | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting legal PS1 image and BIOS |
| Heaviest available system | 30 min | Total Lively and increment | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | No legal test ROMs present |
| After stopping a game | Immediate + 5 min | Total Lively and delta from post-load | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | Awaiting file | No legal test ROMs present |
| After 20 game/system swaps | Immediate + 5 min | Total Lively and delta from post-load | Awaiting files | Awaiting files | Awaiting files | Awaiting files | Awaiting files | Awaiting files | Awaiting files | No legal test ROMs present |
| Immediately after backgrounding | Immediate | Total Lively | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | No legal test ROMs present |
| After 12-second background teardown | 12 sec + 5 min | Total Lively and delta from post-load | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | No legal test ROMs present |
| After returning to wallpaper | 5 min | Total Lively and delta from post-load | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | Awaiting active game | No legal test ROMs present |
| After restarting wallpaper | 5 min | Total Lively and delta from post-load | Not yet measured | Not yet measured | Not yet measured | Not yet measured | Not yet measured | Not yet measured | Not yet measured | Pending clean import |

## Browser instrumentation for the optimization candidate

These browser checks isolate outer-wallpaper work; they are not substitutes for the total Lively process measurements above.

| Check | Before | After | Evidence |
| --- | ---: | ---: | --- |
| Static selector render cadence | 30.0 FPS | 15.1 FPS | 90 frames over 3.0 seconds before; 48 frames over 3.179 seconds after |
| Static CRT canvas redraws after settling | Every rendered frame | 0 over 3.179 seconds | The room rendered 48 frames while the unchanged 640 × 480 CRT canvas was not redrawn or re-uploaded |
| Selector input redraw | n/a | 1 redraw | Right-arrow changed the selected system with one CRT canvas redraw; the reverse input restored it |
| Paused room render loop | n/a | 0 pending frames | Rendered-frame count stayed at 615 across two paused readings 0.9 seconds apart; resume restored one pending animation frame |
| Production diagnostics work | Present every frame | Absent | A production selector URL contained no diagnostics output or lifecycle control panel |

The TV model was reduced from 4,735,104 to 959,048 bytes. Its embedded image decode budget fell from 75,497,492 to 15,728,672 RGBA bytes; three maps used only by the runtime-replaced screen material are one pixel. The HDR environment was reduced from 1,665,771 to 529,519 bytes and from 1024 × 512 to 512 × 256. Final browser reloads rendered the same CRT composition without new console warnings or errors.

The active core still runs at native emulation timing. The optimization does not claim a post-change active-game CPU or memory number until the same legal game/system is measured again.

The optimized clean-import total stayed in the earlier static-wallpaper range instead of falling by the model's calculated decoded-image reduction. WebView2 process allocators, shared GPU accounting, different first-run/library states, and the lack of a same-process before/after trace limit attribution. The observed static CPU peak improved from 6% to 4%, while the two run averages were 3% and 2%; this is encouraging but is not enough to call overall memory behavior stable.

## Interpretation gate

Memory behavior is not called stable until the active-core rows, 20-switch cycle, background teardown, return, and restart rows are measured repeatedly. A value returning near the post-load baseline means its range overlaps or is within 10% of the post-load average after five minutes; the raw ranges and any GPU-process migration must still be reported.
