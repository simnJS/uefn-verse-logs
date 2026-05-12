# UEFN Verse Logs

> Stream Verse logs from Unreal Editor for Fortnite directly into VS Code, with per-category and per-level filtering.

[![Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=simnjs.uefn-verse-logs)
[![Install](https://img.shields.io/badge/install-code%20--install--extension%20simnjs.uefn--verse--logs-007ACC)](https://marketplace.visualstudio.com/items?itemName=simnjs.uefn-verse-logs)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Tail the UEFN log file live, parse out the Verse-related categories, and watch your `Print()` output stream into a VS Code output channel — colored by log level, filtered by category, and synced with the project you have open.

---

## Install

From the VS Code Marketplace:

```
code --install-extension simnjs.uefn-verse-logs
```

Or search **UEFN Verse Logs** in the Extensions sidebar (`Ctrl+Shift+X`).

## Quick start

1. Open your UEFN project folder in VS Code (the one containing `<Project>.uefnproject`).
2. Launch UEFN on the same project.
3. The extension auto-starts the tail. Open the **UEFN Verse** output channel (`View > Output`, pick "UEFN Verse" in the dropdown).
4. Run `Print("Hello, world!")` in your Verse code — it shows up live.

If autostart didn't kick in, click the `Verse: stopped` indicator in the status bar, or run **UEFN Verse: Watch latest log** from the command palette.

## Features

- **Auto-detect the UEFN project** in your workspace via `.uefnproject` (walks up parent folders from each workspace folder).
- **Live tail** of `%LOCALAPPDATA%\UnrealEditorFortnite\Saved\Logs\UnrealEditorFortnite.log` with rotation handling.
- **Filter tree** in the Explorer sidebar — checkboxes per category and per log level. State persists across sessions.
- **Quick filter picker** (`UEFN Verse: Toggle filters…`) — fast multi-select for power users.
- **"Print() only" preset** — one click, only `LogVerse` lines remain.
- **Pause / resume** without stopping the tail or losing filter state.
- **Status bar** with live error and warning counts, click to reveal output.
- **LogOutputChannel** with native level coloring (Debug / Info / Warning / Error).
- **Polling-based** (not `fs.watch`) — reliable on Windows where UEFN keeps the `.log` file open in shared-read.

## Filters

Open the **UEFN Verse** view in the Explorer sidebar. Two sections:

### Catégories

The categories from `uefnVerseLogs.categories` settings (plus any custom you add):

| Category | Default | What it carries |
| --- | --- | --- |
| `LogVerse` | on | `Print()` output from your Verse code |
| `VerseBuild` | on | Compile errors, hot reload events |
| `LogVerseInterop` | off | VNI module loading (chatty at startup) |
| `LogVerseMessageServer` | off | Verse message server lifecycle |
| `LogVersePredicts` | off | Prediction context registration (chatty) |
| `LogVerseUObjectGenerator` | off | Generated UObject events |

### Niveaux

`Fatal`, `Error`, `Warning`, `Display`, `Log`, `Verbose`, `VeryVerbose`. A line shows up only if **both** its category and its level are enabled.

### Adding custom categories

UEFN has hundreds of log categories — anything that shows up in the **Output Log** filter inside UEFN can be added here. Examples: `Cmd`, `LogValkyrieBeacon`, `LogFortMatchmakingV2`. Settings:

```jsonc
{
  "uefnVerseLogs.categories": [
    "LogVerse",
    "VerseBuild",
    "LogValkyrieBeacon",
    "Cmd"
  ]
}
```

Save the file — the filter tree updates live.

## Commands

| Command | Default keybinding | Description |
| --- | --- | --- |
| `UEFN Verse: Watch latest log` | — | Start tailing `UnrealEditorFortnite.log`. |
| `UEFN Verse: Start watching log…` | — | Pick any `.log` file in the UEFN logs folder. |
| `UEFN Verse: Stop watching` | — | Stop the tail. |
| `UEFN Verse: Pause` / `Resume` | — | Pause the stream without stopping the file watch. |
| `UEFN Verse: Toggle filters…` | — | Multi-select picker for categories + levels. |
| `UEFN Verse: Show Print() output only` | — | Preset: keep only `LogVerse`. |
| `UEFN Verse: Reset filters` | — | Restore default checkbox state. |
| `UEFN Verse: Clear output` | — | Empty the output channel. |
| `UEFN Verse: Open output panel` | — | Reveal the **UEFN Verse** output. |
| `UEFN Verse: Open settings` | — | Jump to the extension's settings UI. |

All commands are also available as toolbar buttons in the **UEFN Verse** view title.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `uefnVerseLogs.autoStart` | `true` | Auto-start the tail when a workspace with a `.uefnproject` opens. |
| `uefnVerseLogs.logDirectory` | `""` (= `%LOCALAPPDATA%\UnrealEditorFortnite\Saved\Logs`) | Override the directory containing `.log` files. |
| `uefnVerseLogs.logFileName` | `UnrealEditorFortnite.log` | Active log file name in that directory. |
| `uefnVerseLogs.categories` | 6 Verse categories | Categories displayed in the filter tree. |
| `uefnVerseLogs.pollIntervalMs` | `500` | Poll interval in ms. Minimum 100. |
| `uefnVerseLogs.showTimestamp` | `true` | Prefix each emitted line with the UEFN timestamp. |
| `uefnVerseLogs.showCategory` | `true` | Prefix each emitted line with the log category. |
| `uefnVerseLogs.showProjectHeader` | `true` | Print the detected project at the top of the output. |
| `uefnVerseLogs.revealOnError` | `false` | Reveal the output panel automatically when an Error/Fatal line is emitted. |

Per-project overrides go in `.vscode/settings.json`.

## How it works

UEFN writes every log entry — including Verse `Print()` output — to a single file: `%LOCALAPPDATA%\UnrealEditorFortnite\Saved\Logs\UnrealEditorFortnite.log`.

The extension:

1. **Detects** the UEFN project in your workspace by walking up the workspace folders to find a `.uefnproject`.
2. **Polls** `stat()` on the log file every 500 ms (configurable), reads new bytes since the previous position, reassembles partial lines across reads.
3. **Parses** each line with a regex matching the Unreal log format `[timestamp][frame]Category: [Level: ]message`.
4. **Filters** by category prefix and by level using your TreeView checkboxes.
5. **Emits** matching lines to a `LogOutputChannel`, dispatched to `debug`/`info`/`warn`/`error` based on the parsed level.

Polling rather than `fs.watch` because UEFN keeps the log file open in shared-read mode while running, which makes `fs.watch` miss size changes until UEFN closes the file.

## Limitations

- The UEFN log is **global** — it contains entries from every running UEFN instance. In practice UEFN runs one project at a time, so the output is effectively per-project.
- Only Windows is supported for autostart (UEFN runs on Windows only). The code path itself is platform-agnostic; on macOS / Linux you'd point `logDirectory` at whatever you have.

## Development

```bash
git clone https://github.com/simnjs/uefn-verse-logs.git
cd uefn-verse-logs
npm install
npm run compile
```

Open the folder in VS Code, press **F5**. A debug Extension Development Host opens. From there, open a UEFN workspace to test against a live `.log`.

To package a `.vsix`:

```bash
npx @vscode/vsce package
```

## Contributing

Issues and pull requests welcome at https://github.com/simnjs/uefn-verse-logs.

Useful starting points:
- **Bug reports** — include the offending line from `UnrealEditorFortnite.log` (raw, not from the output channel).
- **New category** — open an issue with the category name and an example line. The default list errs on the side of "useful for `Print()` debugging".

## License

[MIT](LICENSE)
