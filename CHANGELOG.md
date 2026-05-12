# Changelog

## 0.1.1 - 2026-05-12

- Translate every UI string from French to English (TreeView sections, QuickPick placeholders, status bar tooltip, error messages).
- Default `showTimestamp` to `false` to avoid double timestamps — `LogOutputChannel` already prefixes each line with its own timestamp.
- Add `VerseProfile` and `VerseTest` to default categories.
- Settings now apply live: `showTimestamp`, `showCategory`, `showProjectHeader` and `pollIntervalMs` no longer require a restart.
- Replace `Pause` / `Resume` commands with `Restart` (stop + start on the same log, resets stats, re-detects the project).
- Add `Ctrl+Alt+V` chord keybindings for common commands (visible and rebindable in **Preferences: Open Keyboard Shortcuts**).
- Perf: poll every 100 ms by default (was 500 ms), parallelize project detection. Minimum poll interval lowered to 25 ms.
- Replace broken shields.io marketplace badges (their API was returning `retired badge`) with static badges.

## 0.1.0 - 2026-05-12

Initial release.

- Auto-detect the active UEFN project from `.uefnproject`.
- Live tail of `UnrealEditorFortnite.log` with rotation handling.
- Filter tree in the Explorer sidebar with checkboxes per category and per log level.
- `LogOutputChannel` with native log-level coloring.
- Status bar with error/warning counts.
- Quick filter picker (`UEFN Verse: Toggle filters…`).
- `Print() only` preset and `Reset filters` command.
- Pause / resume / clear without losing filter state.
- Persisted filter state via `globalState`.
