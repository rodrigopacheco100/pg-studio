# Changelog

Newest first. Each release adds its section here (see `.github/workflows/release.yml`); the app bundles this file to show what changed after an update.

## v1.3.0 - 2026-11-03

- feat: name tabs opened for a table after it instead of Untitled (7ae66ac)
- feat: follow foreign keys from result cells in a dialog (4b759ec)
- feat: give each editor tab its own results and open tables in a new tab (65a3ed6)

## v1.2.1 - 2026-11-03

- docs: add the MIT license (df12c5e)
- perf: load the SQL formatter and dialogs on demand (e30e5b8)
- refactor: organize the frontend by feature (55e8a9e)
- docs: richer README and AGENTS.md rules to keep it in sync (6a700ed)
- fix: show the release notes in the update dialog (d506851)

## v1.2.0 - 2026-11-02

- feat: duplicate a connection; reconnect when the open one is edited (4e10743)
- feat: background exports with progress windows and a history (27c067c)
- feat: grid filters with column, operator and value, applied with Search (777a646)
- feat: export all rows of a result as CSV, JSON or SQL INSERT (1629138)
- feat: Stop button to cancel the running query (360af14)
- fix: handle backslash escapes in E'...' strings when splitting statements (575c973)
- feat: sort and filter the results grid by column (8e32596)
- feat: SQL snippets at the start of a statement (531ac73)
- feat: confirm data-modifying CTEs without WHERE and ALTER ... DROP (1de97f9)

## v1.1.0 - 2026-11-02

- feat: more themes, editor syntax and environment colors from the theme, color editor (1e06d99)
- feat: themes as JSON files, with Dark, Light, Dracula and Omni built in (553c7ba)
- feat: themed select component instead of the native <select> (102fdb4)
- ci: push the release over SSH with a deploy key and add CODEOWNERS (e3ddf5b)

## v1.0.0 - 2026-11-02

- feat: update the app at startup and show what changed after an update (50db59a)
- feat: tag connections with an environment (dev, staging, prod) (7460823)
- test: isolated end-to-end suite with Playwright and Docker Compose (d33ee56)
- feat: end-to-end test server on Tauri's mock runtime (74caf41)
- feat: list and forget known SSH servers in Settings (2641de1)
- fix: keep the master password prompt open and show errors inside it (d8f39de)
- feat: replace the native context menu with per-place menus (3846b69)
- feat: tabbed preferences with theme, font sizes, editor, query and vault options (b02dea6)
- fix: show the server's error when a TLS connection fails (27798c2)
- feat: confirm before running DROP, TRUNCATE and DELETE/UPDATE without WHERE (0b0fc07)

## v0.5.0 - 2026-11-02

- refactor: split the Tauri backend into commands, state, storage, pg and persist modules (fe828a5)
- feat: SSH tunnel settings in the connection dialog, organized in tabs (ed91f7b)
- feat: SSH tunnel backend (russh) with key, password and agent auth (4a7450e)
- feat: dropping a connection above or below the list moves it to the start or end (bdcda0b)
- feat: store connection passwords in the OS keychain or a master-password vault (fd80e49)
- feat: add PasswordInput with show/hide toggle (c1a4b18)
- feat: connection folders with drag and drop ordering, persisted in SQLite (1491e8c)
- feat: group copy actions into Copy and Copy as submenus (0a5149a)

## v0.4.0 - 2026-11-02

- style: show run info in the footer's muted color (417e58d)
- fix: stable connection rows, host details under the name, hide inactive connections (7ef007f)
- feat: show booleans as italic true/false and export json/jsonb as JSON (fd68e22)
- feat: menu bar and settings dialog with selectable fonts (d8db5fc)
- fix: replace native confirm/alert/prompt with in-app dialogs (94616e4)
- feat: beautify button to format the SQL of the open tab (d8834a5)
- fix: show the server's full error report for failed queries (94fd74e)
- feat: expandable table tree with item detail dialogs (623053a)

## v0.3.0 - 2026-11-02

- feat: editor file tabs and session restore (aff97e8)
- chore: translate UI, comments and docs to English (98c0d61)
- fix: avoid text selection while dragging resize handles (ccd7a03)
- feat: run statement at cursor with Ctrl+Shift+Enter (44250e6)
- feat: run button per statement in the SQL editor (01b13b3)
- docs: add README and AGENTS.md (f986bca)
- feat: resizable sidebar and editor/results split (58b867f)
- feat: persist app settings in settings.json (bed69c3)

## v0.2.0 - 2026-11-01

- feat: initialize PG Studio project with essential files and configurations (8c3e808)
