# Changelog

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
