# PG Studio

A lightweight desktop client for PostgreSQL, built with Tauri 2 (Rust) and React.

## Features

- Saved connections (with optional SSL), opened and closed from the sidebar
- Table list of the connected database; click one to browse its contents, paginated, or expand it to see its columns, constraints, foreign keys, indexes and permissions; double-click any of them for full details
- SQL editor (CodeMirror) with table and column autocomplete
- Editor tabs: create, open, save and save as `.sql` files (`Ctrl+T`, `Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+W`), with an unsaved-changes marker
- A ▶ button beside the first line of each statement runs just that statement
- `Ctrl+Enter` runs the selection or the whole editor, `Ctrl+Shift+Enter` runs the statement at the cursor, `Ctrl+Space` autocompletes
- Query history and named saved queries
- Results with cell selection and copy as JSON, CSV, TSV and INSERT
- Automatic reconnection when the connection drops, with a notice in the status bar
- The app reopens as you left it: open tabs (including unsaved text) and the active connection
- Resizable sidebar and editor; sizes are remembered between sessions

## Requirements

- [Bun](https://bun.sh)
- [Rust](https://rustup.rs) (stable toolchain)
- [Tauri 2 system dependencies](https://tauri.app/start/prerequisites/) for your operating system

## Development

```sh
bun install
bun run tauri dev     # full app (Tauri + Vite)
bun run dev           # frontend only, at http://localhost:1420
bun test              # tests for the utilities in src/lib
bun run build         # type check + frontend build
bun run tauri build   # produces the installer
```

## Local data

Stored in the app data directory of your operating system:

| File | Contents |
|---|---|
| `pg-studio.sqlite` | saved connections, history and saved queries |
| `settings.json` | program settings (sidebar width and editor height) |
| `session.json` | open editor tabs (including unsaved text) and the active connection |

Connection passwords are stored in the SQLite file unencrypted.

## Structure

- `src/`: React frontend (components, views, hooks, utilities)
- `src-tauri/`: Rust backend (Tauri commands, PostgreSQL access, local SQLite, settings)

See [AGENTS.md](AGENTS.md) for architecture details and conventions.
