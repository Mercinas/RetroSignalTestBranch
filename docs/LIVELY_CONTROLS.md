# Lively controls

RetroSignal uses Lively's native property callbacks and command utility. It does not install a competing system-wide keyboard hook.

## Wallpaper keyboard controls

Enable **Lively Settings → Wallpaper → Interaction → Wallpaper Input → Keyboard**. This is what allows the wallpaper to receive its keys while the desktop is active.

| Key | Action |
| --- | --- |
| Numpad `*` | Ask the running Manager to scan the remembered ROM/BIOS folder, import additions, and refresh the catalog; Manager imports also refresh automatically |
| F8 or backtick | Toggle game mode |
| Arrow keys | Navigate systems or games |
| Enter or Tab | Select the highlighted system or game |
| Escape | Running game → game list → system list → music mode |

The rescan key is a Lively dropdown under **Customize → Rescan hotkey**. Available choices are Numpad `*` (default), F6, F7, F9, R, and Disabled. If the Manager is closed, the wallpaper keeps the existing catalog and tells the user to open the Manager before importing additions.

## Background/global controls

Lively's command utility is the supported host-side binding path:

```text
Pause/resume the TV/player: livelycu.exe app --play false/true
Stop the wallpaper:          livelycu.exe closewp --monitor <monitor-id>
Start the wallpaper:         livelycu.exe setwp --file "<installed-folder>" --monitor <monitor-id>
Exit game to game list:      livelycu.exe setprop --monitor <monitor-id> --property "backToGameSelection=true"
```

`backToGameSelection` is also the **Exit game to game list** button in Customize. Lively delivers that property whether or not the wallpaper page itself has focus. Pause/resume is handled by `livelyWallpaperPlaybackChanged`, keeping the room, music, and emulator state together.

For a single pause/resume toggle key, configure the chosen host hotkey tool to alternate Lively's explicit `app --play false` and `app --play true` commands.

Official references: [Lively web interaction](https://github.com/rocksdanister/lively/wiki/Web-Guide-IV-%3A-Interaction) and [command-line controls](https://github.com/rocksdanister/lively/wiki/Command-Line-Controls).
