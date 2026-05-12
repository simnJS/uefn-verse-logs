# UEFN Verse Logs

Stream Verse logs from Unreal Editor for Fortnite directly into VS Code, with per-category and per-level filtering.

## Features

- **Auto-detect the active UEFN project** — opens the right log automatically when a workspace contains a `.uefnproject`.
- **Live tail** of `%LOCALAPPDATA%\UnrealEditorFortnite\Saved\Logs\UnrealEditorFortnite.log` with rotation handling.
- **Filter tree in the Explorer sidebar** — checkboxes for every category and log level.
- **Quick filter picker** — `UEFN Verse: Toggle filters…` for fast multi-select.
- **"Print() only" preset** — show just what your Verse `Print()` calls emit, hide everything else.
- **Pause / resume / clear** without losing your filter setup.
- **Status bar** with error and warning counts, click to open the output panel.
- **Native log levels** via VS Code's `LogOutputChannel` — colored Debug / Info / Warning / Error.

## Quick start

1. Install the extension.
2. Open your UEFN project folder (the one containing `<Project>.uefnproject`) in VS Code.
3. Launch UEFN.
4. The extension auto-starts. Open the `UEFN Verse` output channel to see your `Print()` output live.

If the status bar shows `$(eye-closed) Verse`, click it or run **UEFN Verse: Watch latest log** from the command palette.

## Filters

Open the `UEFN Verse` view in the Explorer to see two sections:

- **Catégories** — every category from `uefnVerseLogs.categories` (plus any you add). Default-enabled: `LogVerse`, `VerseBuild`. Disabled by default (chatty during UEFN startup): `LogVerseInterop`, `LogVerseMessageServer`, `LogVersePredicts`, `LogVerseUObjectGenerator`.
- **Niveaux** — `Fatal`, `Error`, `Warning`, `Display`, `Log`, `Verbose`, `VeryVerbose`.

A line is shown only if **both** its category and its level are checked. Filter state is persisted across sessions in `globalState`.

### Adding custom categories

UEFN has hundreds of log categories (`Cmd`, `LogValkyrieBeacon`, `LogFortMatchmakingV2`, …). Add any of them via settings:

```json
{
  "uefnVerseLogs.categories": [
    "LogVerse",
    "VerseBuild",
    "LogValkyrieBeacon",
    "Cmd"
  ]
}
```

The filter tree updates live when you save.

## Commands

| Command | Description |
| --- | --- |
| `UEFN Verse: Watch latest log` | Start tailing `UnrealEditorFortnite.log`. |
| `UEFN Verse: Start watching log…` | Pick a specific `.log` file. |
| `UEFN Verse: Stop watching` | Stop the tail. |
| `UEFN Verse: Pause` / `Resume` | Pause the stream without stopping the tail. |
| `UEFN Verse: Toggle filters…` | Multi-select picker for categories and levels. |
| `UEFN Verse: Show Print() output only` | Preset: keep only `LogVerse`. |
| `UEFN Verse: Reset filters` | Restore the default checkboxes. |
| `UEFN Verse: Clear output` | Empty the output channel. |
| `UEFN Verse: Open output panel` | Reveal the `UEFN Verse` output. |
| `UEFN Verse: Open settings` | Jump to the extension's settings UI. |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `uefnVerseLogs.autoStart` | `true` | Auto-start tailing when a workspace with a `.uefnproject` opens. |
| `uefnVerseLogs.logDirectory` | _(empty → LOCALAPPDATA)_ | Directory containing UEFN `.log` files. |
| `uefnVerseLogs.logFileName` | `UnrealEditorFortnite.log` | Active log file name. |
| `uefnVerseLogs.categories` | 6 Verse categories | Categories displayed in the filter tree. |
| `uefnVerseLogs.pollIntervalMs` | `500` | Poll interval (ms). UEFN keeps the log open with shared-read, so polling is more reliable than `fs.watch`. |
| `uefnVerseLogs.showTimestamp` | `true` | Prefix each line with the UEFN timestamp. |
| `uefnVerseLogs.showCategory` | `true` | Prefix each line with its category. |
| `uefnVerseLogs.showProjectHeader` | `true` | Print the detected project at the top of the output. |
| `uefnVerseLogs.revealOnError` | `false` | Reveal the output panel automatically on Error/Fatal. |

## How it works

UEFN writes every log entry to a single file at `%LOCALAPPDATA%\UnrealEditorFortnite\Saved\Logs\UnrealEditorFortnite.log`. The extension polls `stat()` on that file every 500 ms (configurable), reads new bytes since the previous position, and re-emits lines that match the active filter set into a `LogOutputChannel`.

Polling rather than `fs.watch` because UEFN keeps the file open in shared-read mode while running, which makes `fs.watch` unreliable on Windows.

## Development

```bash
git clone <repo>
cd uefn-verse-logs
npm install
npm run compile
```

Open the folder in VS Code and press **F5** to launch a debug Extension Development Host.

## License

MIT — see [LICENSE](LICENSE).
